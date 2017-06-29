# le-store-consul

[Greenlock](https://git.daplie.com/Daplie/node-greenlock) store interface for [Consul](https://www.consul.io/)

# Usage

See documentation of Greenlock first!

````
const leStore = require("le-store-consul").create({
  host: "localhost",
  port: 8500,
  secure: false,
  ca: null,
  basekey: "greenlock"
})
````

Parameter | Description | Default
--------- | ----------- | -------
host | Hostname of consul server | "localhost"
port | Port of consul server | 8500
secure | Access consul via HTTPS | false
ca | array of strings or buffers of trusted certificates in PEM format | null
basekey | First part of consul key | "greenlock"
