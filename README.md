# le-store-consul<br/>[![Sponsored by][sponsor-img]][sponsor] [![Version][npm-version-img]][npm] [![Downloads][npm-downloads-img]][npm] [![Dependencies][deps-img]][deps]

[sponsor-img]: https://img.shields.io/badge/Sponsored%20by-Sebastian%20Software-692446.svg
[sponsor]: https://www.sebastian-software.de
[deps]: https://david-dm.org/sebastian-software/le-store-consul
[deps-img]: https://david-dm.org/sebastian-software/le-store-consul.svg
[npm]: https://www.npmjs.com/package/le-store-consul
[npm-downloads-img]: https://img.shields.io/npm/dm/le-store-consul.svg
[npm-version-img]: https://img.shields.io/npm/v/le-store-consul.svg

[Greenlock](https://git.daplie.com/Daplie/node-greenlock) store interface for [Consul](https://www.consul.io/)

## Usage

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

## Copyright

<img src="https://raw.githubusercontent.com/sebastian-software/readable-code/master/assets/sebastiansoftware.png" alt="Sebastian Software GmbH Logo" width="250" height="200"/>

Copyright 2015-2017<br/>[Sebastian Software GmbH](http://www.sebastian-software.de)