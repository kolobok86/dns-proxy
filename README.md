# DNS Proxy

DNS proxy running on NodeJS. Acts as DNS server running locally, that returns specified fake responses for given particular host names, and real responses from upstream DNS server for others. Currently, the application supports forging responses of type "A" (IPv4 address) and "CNAME" (canonical name).


## Usage:
To start the application, open console in application root directory and run the command:

```sh
node index

```

On PC whose DNS requests should be proxied, set the IP address of PC running DNS Proxy. If this is one and the same PC, set `127.0.0.1`.

## Configuration File Options

Configuration is stored in `config.json` file in root directory of the project. The file may be edited and saved while the proxy is running, the updated configuration will be fetched on the fly in this case, with no need to restart the application. The only exclusions are:
 * switching connection type from 'udp' to 'tls',
 * changing local connection parameters,
 * changing TLS connection parameters.

These changes will require restarting of the application.

As configuration is stored in JSON file, coments are not supported. As a workaround, one may add some arbitrarily named field, and fill its value with comment text, like:

```json
"comment_1": "this is comment"
```


## Forging DNS response for particular requested host names

Hostnames and related responses are specified in `requestsToForge` section of the config. This section is in form of JSON array, where each target hostname is specified in separate array item, along with given response. The hostname to forge response for should be specified in `hostName` field of that item. Other fields of the item define parameters of the response that will be returned when that particulad hostname is requested.

Responses of type "A" (IPv4 address) and "CNAME" (canonical name) are supported.

Changes in this section are applied on the fly, without restarting the application.

### Matching incoming requests' hostnames with these in `requestsToForge` section
Currently, each request, whose hostname contans item's `hostName` value, will match that item. I.e., for item with `"hostName": "example.com"`, any of incoming requests with hostnames `example.com`, `www.example.com`, `example.com.net` will match. This will be improved in future releases, enabling usage of asterisk `*` substitutions and / or regular expressions.

### Forge IPv4 address in response
If you need to return specific IP address for given hostname, create a record in `requestsToForge` section, contaning the hostname in `hostName` field, and IP address in `ip` field respectively, like that:
```json
     "requestsToForge": [
        {
            "comment": "Serve requests to example.com locally",
            "hostName": "example.com",
            "ip": "127.0.0.1"
        },
        {
            "comment": "Serve requests to example123.com locally",
            "hostName": "another-example.com",
            "ip": "127.0.0.1"
        }
    ]
```
Edit it according to your needs, specifying proper `hostName`s and `ip`'s.

Currently, only one IP can be set per hostname.


### Forge CNAME response
Instead of fake IP, there is an ability to return response of CNAME type for requests matching given target hostname.
In other words, if you need to return specific canonical name for given hostname, as if the hostname itself was an alias for the name you're returning, then add a record contaning `hostName` field with that given hostname (that we'll pretend is an alias), and `cname` field with fake canonical hostname, to `requestsToForge` section. Like the following:

```json
     "requestsToForge": [
        {
            "comment": "Serve requests to 'example.com' like it is an alias for canonical name 'dev.example.com'",
            "hostName": "example.com",
            "cname": "dev.example.com"
        }
    ]
```

If incoming request itself is of type CNAME, then forged response for it will contain fake canonical name only. If request is of type A (IPv4 address), then response, in addition to canonical name, will contain IP address(es) for it, resolving them with up-level DNS server. See explanation in [RFC-1034, Section 5.2.2](https://tools.ietf.org/html/rfc1034#section-5.2.2).


**Please mention:** Three example entrances mentioned above present in default config as example, feel free to remove them before using the application.


### Upstream Connection Parameters
 - `remoteDnsConnectionMode` [`udp` or `tls`]: connection protocol for upstream DNS server. UDP and TLS are currently supported. Default: `udp`.
 - `upstreamDnsIP`: IP address of upstream DNS server for **UDP** protocol (only one address supported for now). Default: `8.8.8.8` (Google DNS).
 - `upstreamDnsPort`: port to connect on upstream DNS server with **UDP** protocol. Default: `53`.
 - `upstreamDnsTlsHost`: IP address of upstream DNS server for **TLS** protocol (only one address supported for now). Default: `8.8.8.8` (Google DNS).
 - `upstreamDnsTlsPort`: port to connect on upstream DNS server with **TLS** protocol. Default `853`.


### Local Connection Parameters
 - `localDnsPort`: local port for incoming connections. Default: `53`.
 - `forgedRequestsTTL`: TTL (time to live) for forged responses, in seconds. Default: `10`.


## Tests
Tests are very basic, assuming that if running tests produce some output in console without throwing an error, they are concidered to pass. To run tests, in application root directory, run in console:

```sh
node tests/test.js
```

## License
Licence is yet to choose.
