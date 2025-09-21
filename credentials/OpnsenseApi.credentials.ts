import {
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

const MAX_TIMEOUT_MS = 5000; // 5 seconds

export class OpnsenseApi implements ICredentialType {
  name = 'opnsenseApi';
  displayName = 'OPNSense API';
  documentationUrl = 'https://docs.opnsense.org/development/how-tos/api.html';
  properties: INodeProperties[] = [
    {
      displayName: 'Router URL',
      name: 'routerUrl',
      type: 'string',
      validateType: 'url',
      default: '',
      required: true,
      placeholder: 'https://192.168.1.1',
      description: 'IP or hostname of the OPNSense router',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true
      },
      default: '',
      description: 'API key for OPNSense router',
    },
    {
      displayName: 'API Secret',
      name: 'apiSecret',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      description: 'API secret for OPNSense router',
    },
  ];
  test: ICredentialTestRequest = {
    request: {
      method: 'GET',
      url: '={{$credentials.routerUrl}}/api/routes/gateway/status',
      auth: {
        username: '={{$credentials.apiKey}}',
        password: '={{$credentials.apiSecret}}',
      },
      json: true,
      skipSslCertificateValidation: true,
      timeout: MAX_TIMEOUT_MS,
    }
  }
};
