# DNS Proxy

DNS proxy running on NodeJS. It acts as DNS server running locally, that returns specified fake responses for given particular host names, and passes real responses from upstream DNS server for others transparently byte-to-byte (so, these passed responses can be of any type, not necesarily supported by the application). Currently, the application supports forging responses of type "A" (IPv4 address) and "CNAME" (canonical name).

Forging of IPv6 responses is not supported. If request of type "AAAA" (IPv6) is received and hostname appears in list of hostnames to forge responses for, then "Not implemented" response is returned to sender. This is done for cases when local clients use both IPv4 and IPv6 protocols to resolve host IP. Otherwise, they could be able to fetch real IPv6 address, while getting fake IPv4 one.


## Usage:
To start the application, open console in application root directory and run the command:

```sh
node index

```

On PC whose DNS requests should be proxied, set the IP address of PC running DNS Proxy. If this is one and the same PC, set `127.0.0.1`.

## Configuration File Options

Configuration is stored in _config.json_ file in root directory of the project. Configuration parameters are defined as properties of that JSON file:
```json
{
    "remoteDnsConnectionMode": "udp",
    "upstreamDnsUdpHost": "8.8.8.8",
    "upstreamDnsUdpPort": 53,
    "localDnsPort": 53,
    "forgedRequestsTTL": 10,
    "upstreamDnsTlsHost": "8.8.8.8",
    "upstreamDnsTlsPort": 853,

    "requestsToForge": []
}
```
**Please mention:** By default, the application has example _config.json_ file with default settings listed above.


The file may be edited and saved while the proxy is running, the updated configuration will be fetched on the fly in this case, with no need to restart the application. The only exclusions are:
 * switching connection type from 'udp' to 'tls',
 * changing local connection parameters,
 * changing TLS connection parameters.

These changes will require restarting of the application.

As configuration is stored in JSON file, coments are not supported. As a workaround, one may add some arbitrarily named field, and fill its value with comment text, like:

```json
"comment_1": "this is comment"
```

### Upstream Connection Parameters
These parameters define how the application will connect to upstream (up-level) DNS server:
 - `remoteDnsConnectionMode` [`udp` or `tls`]: connection protocol for upstream DNS server. UDP and TLS are currently supported. Default: `udp`.
 - `upstreamDnsUdpHost`: IP address of upstream DNS server for **UDP** protocol (only one address is supported for now). Default: `8.8.8.8` (Google DNS).
 - `upstreamDnsUdpPort`: port to connect on upstream DNS server with **UDP** protocol. Default: `53`.
 - `upstreamDnsTlsHost`: IP address of upstream DNS server for **TLS** protocol (only one address is supported for now). Default: `8.8.8.8` (Google DNS).
 - `upstreamDnsTlsPort`: port to connect on upstream DNS server with **TLS** protocol. Default `853`.

`upstreamDnsUdpHost` and `upstreamDnsUdpPort` are required and applied only if `remoteDnsConnectionMode` is `udp`. And vise versa, `upstreamDnsTlsHost` and `upstreamDnsTlsPort` are required and applied only if `remoteDnsConnectionMode` is `tls`.


### Local Connection Parameters
These parameters specify, how the application will accept incoming local connections from clients:
 - `localDnsPort`: local port for incoming connections. Default: `53` (standard DNS port).
 - `forgedRequestsTTL`: TTL (time to live) for forged responses, in seconds. Default: `10`.

Incoming local requests are only accepted over UDP protocol.

**Please mention:** application accepts network connections on all available network interfaces. Whether you need to limit it, please concider using firewall.


## Forging DNS response for particular requested host names

Hostnames and related responses are specified in `requestsToForge` section of the config. This section is in form of JSON array, where each target hostname is specified in separate array item, along with given response. The hostname to forge response for should be specified in `hostName` field of that item. Other fields of the item define parameters of the response that will be returned when that particulad hostname is requested.


```json
     "requestsToForge": [
        {
            "comment": "Serve requests to 'example.com' locally, returning ip address 127.0.0.1",
            "hostName": "example.com",
            "ip": "127.0.0.1"
        },
        {
            "comment": "Serve requests to 'prod.example.com' like it is an alias for canonical name 'dev.example.com', i.e. CNAME behavior",
            "hostName": "prod.example.com",
            "cname": "dev.example.com"
        },
        {
            "comment": "Forward requests for subdomains of 'example.com' to local network ip 192.168.0.15",
            "hostName": "*.example.com",
            "ip": "192.168.0.15"
        },
        {
            "comment": "Serve requests to 'another-example.com' locally",
            "hostName": "another-example.com",
            "ip": "127.0.0.1"
        }
    ]
```

**Please mention:** four entrances mentioned above will present in default config as example, feel free to remove them before using the application.

Changes in this section are applied on the fly, without restarting the application.

Currently, the application supports mocking responses of type "A" (IPv4 address) and "CNAME" (canonical name).


### Matching incoming requests' hostnames with these in `requestsToForge` section
Request hostnames may be specified literally (i.e. `example.com`) or using wildcard templates (like `*.example.com`, `*example*`, `example.*.com` or so). `*` symbol means that group of any symbols may appear in its place, including none symbols at all. Concider the following examples:
* Pattern `example.com` will match hostname `example.com` and only it.
* Pattern `*example.com` will match hostnames of a kind `example.com` and `www.example.com`.
* Pattern `*.example.com` will match `www.example.com` and `www.test.example.com`, but NOT `example.com`.
* Pattern `*example*` will match `www.example.com`, `example.net` and `test-example.org.net`.
* Pattern `test*.example.com` will match `test.example.com`, `test1.example.com`, and `test.test.test.example.com`.


`requestsToForge`'s items are iterated one by one, till the first match occurs. Say, if you have records with patterns `*.example.com` and `www.example.com` (in that order) in your config, and hostname `www.example.com` is requested, it will match first pattern `*.example.com` and stop on it, not reaching `www.example.com` record. So, the more specific records should be placed above the less specific ones in the config.

### Forge IPv4 address in response
If you need to return specific IP address for given hostname, create a record in `requestsToForge` section, contaning the hostname in `hostName` field, and IP address in `ip` field respectively, like that:

```json
        {
            "comment": "Serve requests to 'example.com' locally",
            "hostName": "example.com",
            "ip": "127.0.0.1"
        }
```

Edit it according to your needs, specifying proper `hostName` and `ip`.

Currently, only one IP can be set for specific hostname.

As mentioned above, if request of type "AAAA" (IPv6) matches the hostname, then "Not implemented" response is returned. So, if some local client sends two requests: one to resolve IPv4 address, and another for IPv6, then the application sends fake response for IPv4, and "Not implemented" for IPv6. Otherwise, client could bypass proxy and get real IPv6 address.


### Forge CNAME response
Instead of fake IP, there is an ability to return response of CNAME type.
In other words, application can return specific canonical name for given requested hostname, as if it was an alias for the returned hostname. To achieve that, add a record contaning `hostName` field with the target hostname (that we'll pretend is an alias), and `cname` field with fake canonical hostname, to `requestsToForge` section. Like the following:

```json
        {
            "comment": "Serve requests to 'prod.example.com' like it is an alias for canonical name 'dev.example.com'",
            "hostName": "prod.example.com",
            "cname": "dev.example.com"
        }
```

If incoming request itself is of type CNAME, then forged response will contain fake canonical name only. If request is of type A (IPv4 address), then response, in addition to canonical name, will contain IP address(es) for it, resolving them with up-level DNS server. See explanation in [RFC-1034, Section 5.2.2](https://tools.ietf.org/html/rfc1034#section-5.2.2).


## Tests
Tests are very basic, assuming that if running tests produce some output in console without throwing an error, they are concidered to pass. To run tests, in application root directory, run in console:

```sh
node tests/test.js
```

## License
Licence is yet to choose.
