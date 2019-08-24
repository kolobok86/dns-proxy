# DNS Proxy

DNS proxy running on NodeJS. Acts as DNS server running locally, returning specified IP address for given host names, and normal DNS response from upstream DNS server for others.


## Usage:
In application root directory, run in console:

```sh
node index

```

On PC, which DNS requests should be proxied, set the IP address of PC with DNS Proxy running. If this is one and the same PC, set 127.0.0.1.

## Configuration File Options

Configuration is stored in `config.json` file in root directory of the project. The file can be edited and saved when the proxy is running, the updated configuration will be fetched on the fly, without restarting. The only exclusions are:
 * switching connection type from 'udp' to 'tls',
 * changing TLS connection parameters.

These changes will require restarting of the application.

As this is JSON file, coments are not supported. As a dirty trick, you can add some arbitrarily named field name, and fill its value with comment text, like:

```json
"comment_1": "this is comment"
```


## Forging DNS response for particular requesed hosts
Hostnames and related responses are specified in `requestsToForge` secion of the config. This section is in form of JSON array, where each target hostname with desired response is specified in separate array item. The hostname to forge response for should be specified in `hostName` field of that item, and other fields define response that will be returned when that particulad hostname is requested. Currently, responses of type "A" (IP address) and "CNAME" (canonical name) are supported.

Changes in this section of config are applied on the go, no need to restart the application.

### Forge IP address in response
Hosts, which IP address should be replaced with specified one, and the fake IP's are stored in config field `requestsToForge`:
```json
     "requestsToForge": [
        {
            "comment": "Serve requests to example.com locally",
            "hostName": "example.com",
            "ip": "127.0.0.1"
        },
        {
            "comment": "Serve requests to example123.com locally",
            "hostName": "example123.com",
            "ip": "127.0.0.1"
        }
    ]
```
Edit it according to your needs, specifying proper `hostName`s and `ip`'s. Currently, any requested hostname, containing given value, will match the pattern. I.e., for `"hostName": "example123.com"`, any of `example123.com`, `www.example123.com`, `example123.com.net` will match. This will be improved in future releases, enabling usage of asterisk * substitutions and / or regular expressions.

Currently, only one IP can be set for hostname.


### Fake CNAME response
If `cname` field is specified, then response for `hostName` request will act like CNAME one. I.e., response will contain hostname specified in `cname` field as canonical name for requested host.

If request itself is of type CNAME, then response will contain only canonical name. If request is of type A (host address), then response, in addition to canonical name, will contain IP address(es) for it, resolving them with up-level DNS server. See explanation in [RFC-1034, Section 5.2.2](https://tools.ietf.org/html/rfc1034#section-5.2.2).

For instance, if your config's section `requestsToForge` contains a record:
```json
     "requestsToForge": [
        {
            "comment": "Serve requests to 'prod.example.com' like it is an alias for canonical name 'dev.example.com'",
            "hostName": "prod.example.com",
            "cname": "dev.example.com"
        }
    ]
```
Then, If DNS proxy gets local request of type A and domain name _"prod.example.com"_, it will resolve IP addresses for domain _"dev.example.com"_, and compose response to local client, containing information that canonical name for alias _"prod.example.com"_ is _"dev.example.com"_, and real (not forged) IP's for _"dev.example.com"_ domain.


This is useful for cases when you need to get IP address(es) from domain you're using in _development_, and supply them to local application like they belong to _production_ one, withoud setting these IP(s) in config manually. Say, the IP is subject to change from time to time, or there are several IP's.


**Please mention:** Three example entrances mentioned above will present in default config as example, feel free to remove them before using the application.


### Upstream Connection Parameters
 - `remoteDnsConnectionMode` [`udp` or `tls`]: connection protocol for upstream DNS server, UDP and TLS are currently supported. Default `udp`.
 - `upstreamDnsIP`: IP address of upstream DNS server for **UDP** protocol (only one address supported for now). Default `8.8.8.8` (Google DNS).
 - `upstreamDnsPort`: port to connect on upstream DNS server with **UDP** protocol. Default `53`.
 - `upstreamDnsTlsHost`: IP address of upstream DNS server for **TLS** protocol (only one address supported for now). Default `8.8.8.8` (Google DNS).
 - `upstreamDnsTlsPort`: port to connect on upstream DNS server with **TLS** protocol. Default `853`.


### Local Connection Parameters
 - `localDnsPort`: local port for incoming connections. Default `53`.
 - `forgedRequestsTTL`: TTL (time to live) for forged responses. Default 10 sec.


## Tests
Tests are very basic, assuming that if running tests produce some output in console without throwing an error, they are concidered to pass. To run tests, in application root directory, run in console:

```sh
node tests/test.js
```

## License
Licence is yet to choose.
