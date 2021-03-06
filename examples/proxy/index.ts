/**
 * Run this example using:
 * 
 *    deno run --allow-net ./examples/proxy/index.ts
 * 
 *    if have the repo cloned locally OR
 * 
 *    deno run --allow-net https://raw.githubusercontent.com/asos-craigmorten/opine/main/examples/proxy/index.ts
 * 
 *    if you don't!
 * 
 */

import opine from "../../mod.ts";
import { proxy } from "https://deno.land/x/opineHttpProxy@1.0.0/mod.ts";

const app = opine();

app.use(proxy("https://github.com/asos-craigmorten/opine"));

app.listen({ port: 3000 });
console.log("Opine started on port 3000");
