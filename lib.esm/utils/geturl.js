import http from "http";
import https from "https";
import { gunzipSync } from "zlib";
import { assert } from "./errors.js";
import { getBytes } from "./data.js";
/**
 *  @_ignore:
 */
export async function getUrl(req, signal) {
    const protocol = req.url.split(":")[0].toLowerCase();
    assert(protocol === "http" || protocol === "https", `unsupported protocol ${protocol}`, "UNSUPPORTED_OPERATION", {
        info: { protocol },
        operation: "request"
    });
    assert(protocol === "https" || !req.credentials || req.allowInsecureAuthentication, "insecure authorized connections unsupported", "UNSUPPORTED_OPERATION", {
        operation: "request"
    });
    const method = req.method;
    const headers = Object.assign({}, req.headers);
    const options = { method, headers };
    const request = ((protocol === "http") ? http : https).request(req.url, options);
    request.setTimeout(req.timeout);
    const body = req.body;
    if (body) {
        request.write(Buffer.from(body));
    }
    request.end();
    return new Promise((resolve, reject) => {
        // @TODO: Node 15 added AbortSignal; once we drop support for
        // Node14, we can add that in here too
        request.once("response", (resp) => {
            const statusCode = resp.statusCode || 0;
            const statusMessage = resp.statusMessage || "";
            const headers = Object.keys(resp.headers || {}).reduce((accum, name) => {
                let value = resp.headers[name] || "";
                if (Array.isArray(value)) {
                    value = value.join(", ");
                }
                accum[name] = value;
                return accum;
            }, {});
            let body = null;
            //resp.setEncoding("utf8");
            resp.on("data", (chunk) => {
                if (signal) {
                    try {
                        signal.checkSignal();
                    }
                    catch (error) {
                        return reject(error);
                    }
                }
                if (body == null) {
                    body = chunk;
                }
                else {
                    const newBody = new Uint8Array(body.length + chunk.length);
                    newBody.set(body, 0);
                    newBody.set(chunk, body.length);
                    body = newBody;
                }
            });
            resp.on("end", () => {
                if (headers["content-encoding"] === "gzip" && body) {
                    body = getBytes(gunzipSync(Buffer.from(body)));
                }
                resolve({ statusCode, statusMessage, headers, body });
            });
            resp.on("error", (error) => {
                //@TODO: Should this just return nornal response with a server error?
                error.response = { statusCode, statusMessage, headers, body };
                reject(error);
            });
        });
        request.on("error", (error) => { reject(error); });
    });
}
//# sourceMappingURL=geturl.js.map