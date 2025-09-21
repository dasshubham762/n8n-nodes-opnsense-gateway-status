import {
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
  NodeApiError,
  NodeConnectionType,
  NodeOperationError,
  tryToParseDateTime,
  ICredentialDataDecryptedObject
} from 'n8n-workflow';

const MAX_TIMEOUT_MS = 5000; // 5 seconds

const generateAuth = (credentials: ICredentialDataDecryptedObject) => ({
  username: credentials.apiKey as string,
  password: credentials.apiSecret as string,
});

export class OpnsenseGatewayStatus implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'OPNSense Gateway Status',
    name: 'opnsenseGatewayStatus',
    group: ['trigger'],
    version: 1,
    description: 'Fetch OPNSense gateway status and trigger if it changes',
    defaults: {
      name: 'OPNSense Gateway Status',
    },
    icon: 'file:opnsenseGatewayStatus.svg',
    polling: true,
    inputs: [],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'opnsenseApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Gateway Name or ID',
        name: 'gateway',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getGateways',
          loadOptionsDependsOn: ['credentials'],
        },
        default: '',
        required: true,
        description: 'Select the gateway to monitor. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Trigger Delay (Minutes)',
        name: 'triggerDelay',
        type: 'number',
        typeOptions: {
          minValue: 0,
          maxValue: 60,
        },
        default: 0,
        description: 'Delay after a status change before triggering the workflow',
      }
    ],
  };

  methods = {
    loadOptions: {
      async getGateways(this: ILoadOptionsFunctions) {
        const credentials = await this.getCredentials('opnsenseApi');

        try {
          const response = await this.helpers.request({
            method: 'GET',
            url: `${credentials.routerUrl}/api/routes/gateway/status`,
            auth: generateAuth(credentials),
            json: true,
            rejectUnauthorized: false,
            timeout: MAX_TIMEOUT_MS,
          });

          return response.items.map((gw: any) => ({
            name: gw.name,
            value: gw.name,
            description: `Status: ${gw.status_translated}`,
          }));
        } catch {
          // If error fetching gateways, return empty list
          return [];
        }
      },
    },
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const gateway = this.getNodeParameter('gateway', 0) as string;
    const credentials = await this.getCredentials('opnsenseApi');
    const triggerDelay = this.getNodeParameter('triggerDelay', 0) as number;

    // Access workflow static data (persisted between node runs in this workflow)
    const workflowStaticData = this.getWorkflowStaticData('node');
    const lastStatus = workflowStaticData[gateway] || null;
    const lastStatusTime = (workflowStaticData[`${gateway}_time`] || 0) as number;
    const hasTriggered = (workflowStaticData[`${gateway}_triggered`] || false) as boolean;

    const triggerOnChange = (currentStatus: string) => {
      if (lastStatus !== currentStatus) {
        workflowStaticData[gateway] = currentStatus;
        workflowStaticData[`${gateway}_time`] = Date.now();
        workflowStaticData[`${gateway}_triggered`] = false;
      }

      if (!hasTriggered && Date.now() - lastStatusTime >= (triggerDelay * 60000)) {
        workflowStaticData[`${gateway}_triggered`] = true;
        return this.prepareOutputData([
          {
            json: {
              gateway,
              status: currentStatus,
              changedAt: lastStatusTime ? tryToParseDateTime(new Date(lastStatusTime)) : null
            }
          },
        ]);
      } else {
        return null;
      }
    }

    try {
      const response = await this.helpers.request({
        method: 'GET',
        url: `${credentials.routerUrl}/api/routes/gateway/status`,
        auth: generateAuth(credentials),
        json: true,
        rejectUnauthorized: false,
        timeout: MAX_TIMEOUT_MS,
      });

      const gwStatus = response.items.find((gw: any) => gw.name === gateway);
      if (!gwStatus) {
        throw new NodeOperationError(this.getNode(), `Gateway ${gateway} not found in OPNSense response`);
      }

      // Normalize 'none' status to 'up'
      const currentStatus = gwStatus?.status === 'none' ? 'up' : gwStatus?.status;

      return triggerOnChange(currentStatus);
    } catch (error: any) {
      // Handle timeout or error as before, treat timeout as 'down'
      if (
        error.code === 'ECONNABORTED' ||
        (error.message && error.message.match(/timeout|timed out/i))
      ) {
        const currentStatus = 'down';
        return triggerOnChange(currentStatus);
      }
      throw new NodeApiError(this.getNode(), error);
    }
  }
}
