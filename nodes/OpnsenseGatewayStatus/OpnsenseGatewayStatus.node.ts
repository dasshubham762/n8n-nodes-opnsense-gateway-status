import {
    ILoadOptionsFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    IPollFunctions,
    NodeApiError,
    NodeConnectionType,
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
                displayName: 'Gateway Name',
                name: 'gateway',
                type: 'options',
                typeOptions: {
                    loadOptionsMethod: 'getGateways',
                },
                default: '',
                required: true,
                description: 'Select the gateway to monitor.',
            },
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

        // Access workflow static data (persisted between node runs in this workflow)
        const workflowStaticData = this.getWorkflowStaticData('node');

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
            const currentStatus = gwStatus?.status || 'unknown';

            const lastStatus = workflowStaticData[gateway] || null;

            if (lastStatus !== currentStatus) {
                // Status changed - update stored status
                workflowStaticData[gateway] = currentStatus;

                // Return output to trigger workflow
                return this.prepareOutputData([
                    { json: { gateway, oldStatus: lastStatus, newStatus: currentStatus } },
                ]);
            }

            // No change - do not trigger output
            return null;
        } catch (error: any) {
            // Handle timeout or error as before, treat timeout as 'down'
            if (
                error.code === 'ECONNABORTED' ||
                (error.message && error.message.match(/timeout|timed out/i))
            ) {
                const lastStatus = workflowStaticData[gateway] || null;
                if (lastStatus !== 'down') {
                    workflowStaticData[gateway] = 'down';
                    return this.prepareOutputData([
                        { json: { gateway, oldStatus: lastStatus, newStatus: 'down', reason: 'timeout' } },
                    ]);
                }
                return null;
            }
            throw new NodeApiError(this.getNode(), error);
        }
    }
}
