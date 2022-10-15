import { ApiRsp } from '../../ApiType';

export async function registerApi({
  name,
  password
}: {
  name: string;
  password: string;
}): Promise<ApiRsp> {
  const rsp = await fetch('/register', {
    method: 'POST',
    body: JSON.stringify({
      name,
      password
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
  return await rsp.json();
}
