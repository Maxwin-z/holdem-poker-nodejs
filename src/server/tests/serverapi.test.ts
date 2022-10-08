import * as jwt from "jsonwebtoken";
import { secret } from "../config";
import { assert } from "chai";
import axios from "axios";

interface Rsp {
  code: number;
  error: string;
  data: {
    [x: string]: any;
  };
}

let token: string = "";

axios.defaults.baseURL = "https://api.example.com";

const BASE_URL = "http://localhost:3002";

async function post(
  url: string,
  body: { [x: string]: any },
  _token: string = ""
): Promise<any> {
  const rsp: Rsp = (
    await axios.post(`${BASE_URL}${url}`, body, {
      headers: {
        authorization: _token ? _token : token ? token : "",
      },
    })
  ).data;

  return rsp;
}

async function get(
  url: string,
  body: { [x: string]: any },
  _token: string = ""
): Promise<any> {
  const rsp: Rsp = (
    await axios.get(`${BASE_URL}${url}`, {
      params: body,
      headers: {
        authorization: _token ? _token : token ? token : "",
      },
    })
  ).data;
  // console.log(51, rsp);

  return rsp;
}

describe("API", () => {
  before(async () => {
    const rsp = await post("/register", {
      name: "maxwin",
      avatar: "",
    });
    token = rsp.data;
    console.log("got token", token);
  });
  it("jwt", () => {
    const data = "hello world";
    const sign = jwt.sign(data, secret);
    const decoded = jwt.verify(sign, secret);
    assert.equal(decoded, data);
  });

  it("invalid token", async () => {
    const rsp = await get("/json", {}, "invalid token");
    assert.equal(rsp.code, -1);
  });

  it("valid token", async () => {
    const rsp = await get("/json", { a: 1 });
    assert.deepEqual(rsp, { code: 0, data: { name: "maxwin" } });
  });
});
