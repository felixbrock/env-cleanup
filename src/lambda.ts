import axios, { AxiosRequestConfig } from 'axios';
import { appConfig } from './config';

export interface TriggerResponse {
  status: number;
}

const getJwt = async (): Promise<string> => {
  try {
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${appConfig.cloud.authSchedulerEnvConfig.clientId}:${appConfig.cloud.authSchedulerEnvConfig.clientSecret}`
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appConfig.cloud.authSchedulerEnvConfig.clientId,
      }),
    };

    const response = await axios.post(
      appConfig.cloud.authSchedulerEnvConfig.tokenUrl,
      undefined,
      config
    );
    const jsonResponse = response.data;
    if (response.status !== 200) throw new Error(jsonResponse.message);
    if (!jsonResponse.access_token)
      throw new Error('Did not receive an access token');
    return jsonResponse.access_token;
  } catch (error: unknown) {
    if (typeof error === 'string') return Promise.reject(error);
    if (error instanceof Error) return Promise.reject(error.message);
    return Promise.reject(new Error('Unknown error occured'));
  }
};

const removeTestSuiteDuplicates = async (
  targetOrgId: string,
  jwt: string
): Promise<void> => {
  console.log(
    `Triggering removal of duplicate test suites for organization ${targetOrgId}`
  );

  const config: AxiosRequestConfig = {
    headers: { Authorization: `Bearer ${jwt}` },
    params: new URLSearchParams({ targetOrgId }),
  };

  const response = await axios.delete(
    `${appConfig.baseurl.observability}/api/v1/test-suites/duplicates`,
    config
  );

  if (response.status !== 200)
    throw new Error(
      `Failed to trigger removal of duplicate test suites for organization ${targetOrgId}`
    );

  return response.data;
};

const getOrgIds = async (jwt: string): Promise<string[]> => {
  const config: AxiosRequestConfig = {
    headers: { Authorization: `Bearer ${jwt}` },
  };

  const response = await axios.get(
    `${appConfig.baseurl.account}/api/v1/organizations`,
    config
  );

  if (response.status !== 200)
    throw new Error(`Failed to retrieve organization ids from account service`);

  const { data } = response;

  if (
    !Array.isArray(data) ||
    data.some((el) => typeof el !== 'object' || !('id' in el))
  )
    throw new Error('Invalid response from account service');

  return response.data.map((el: { id: string }) => el.id);
};

const handle = async (): Promise<void> => {
  const jwt = await getJwt();

  const orgIds = await getOrgIds(jwt);

  await Promise.all(
    orgIds.map(async (orgId) => {
      const res = await removeTestSuiteDuplicates(orgId, jwt);
      return res;
    })
  );
};

export const handler = async (
  event: {
    Records: { body: string }[];
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: any,
  callback: any
): Promise<void> => {
  try {
    const batchSize = event.Records.length;

    console.log(`Executing batch of ${batchSize}`);

    await Promise.all(
      event.Records.map(async () => {
        await handle();
      })
    );

    callback(null, event);
  } catch (error: unknown) {
    if (error instanceof Error) console.error(error.stack);
    else if (error) console.trace(error);
    else console.trace('Uknown error occurred');
  }
};
