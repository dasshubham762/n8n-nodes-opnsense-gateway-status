import {
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
  NodeApiError,
  NodeConnectionType,
  NodeOperationError,
  tryToParseDateTime
} from 'n8n-workflow';

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
        displayName: 'Router IP',
        name: 'routerIp',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://192.168.1.1',
        description: 'IP or hostname of the OPNSense router',
      },
      {
        displayName: 'Gateway Name or ID',
        name: 'gateway',
        type: 'options',
        typeOptions: {
          loadOptionsMethod: 'getGateways',
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
        const routerIp =
          this.getNodeParameter('routerIp') as string | undefined;
        const credentials = await this.getCredentials('opnsenseApi');

        if (!routerIp) {
          return [];
        }

        try {
          const response = await this.helpers.request({
            method: 'GET',
            url: `${routerIp}/api/routes/gateway/status`,
            auth: credentials,
            json: true,
            rejectUnauthorized: false,
            timeout: 5000,
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
    const routerIp = this.getNodeParameter('routerIp', 0) as string;
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
        url: `${routerIp}/api/routes/gateway/status`,
        auth: credentials,
        json: true,
        rejectUnauthorized: false,
        timeout: 10000,
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
