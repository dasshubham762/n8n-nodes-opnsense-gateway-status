import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class OpnsenseApi implements ICredentialType {
  name = 'opnsenseApi';
  displayName = 'OPNSense API';
  documentationUrl = 'https://docs.opnsense.org/development/how-tos/api.html';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'username',
      type: 'string',
      default: '',
      description: 'API key for OPNSense router',
    },
    {
      displayName: 'API Secret',
      name: 'password',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      description: 'API secret for OPNSense router',
    },
  ];
}
