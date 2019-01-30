# DNS Proxy

DNS proxy running on NodeJS. Acts as DNS server running locally, returning specified IP address for given host names, and normal DNS response from upstream DNS server for others.


## Usage:
In application root directory, run in console:

```sh
node index

```

On PC, which DNS requests should be proxied, set the IP address of PC with DNS Proxy running. If this is one and the same PC, set 127.0.0.1.

## Configuration File Options

Configuration is stored in `config.json` file in root directory of the project. The file can be edited and saved when the proxy is running, the updated configuration will be fetched on the fly, without restarting. As this is JSON file, coments are not supported. As a dirty trick, you can add some arbitrarily named field name, and fill its value with comment text, like:
```"comment_1": "this is comment"```


### Defininition of Hosts to Forge IP's
Hosts, which IP address should be replaced with specified one, and the IP's themselves are stored in config field `requestsToForge`:
```json
     "requestsToForge": [
        {
            "comment": "Serve requests to yandex.ru locally",
            "hostName": "yandex.ru",
            "ip": "127.0.0.1"
        },
        {
            "comment": "Serve requests to google.com locally",
            "hostName": "google.com",
            "ip": "127.0.0.1"
        }
    ]
```
Edit it according to your needs, specifying proper `hostName`s and `ip`'s. Currently, any requested host name, containing given value, will match the pattern. I.e., for `"hostName": "google.com"`, any of `google.com`, `www.google.com`, `google.com.net` will match.

**Please mention:** Two entrances mentioned above will present in config as example, please remove them before using the proxy.


### Upstream Connection Parameters
 - `remoteDnsConnectionMode` [`udp` or `tls`]: connection protocol for upstream DNS server, UDP and TLS are currently supported. Default `udp`.
 - `upstreamDnsIP`: IP address of upstream DNS server for **UDP** protocol (only one address supported for now). Default `8.8.8.8` (Google DNS).
 - `upstreamDnsPort`: port to connect on upstream DNS server with **UDP** protocol. Default `53`.
 - `upstreamDnsTlsHost`: IP address of upstream DNS server for **TLS** protocol (only one address supported for now). Default `8.8.8.8` (Google DNS).
 - `upstreamDnsTlsPort`: port to connect on upstream DNS server with **TLS** protocol. Default `853`.


### Local Connection Parameters
 - `localDnsPort`: local port for incoming connections. Default `53`.
 - `forgedRequestsTTL`: TTL (time to live) for forged responses ()  10,


## Tests
Tests are very basic, assuming that if running tests produce some output in console without throwing an error, they are concidered to pass. To run tests, in application root directory, run in console:

```sh
node tests/test.js
```

## License
Licence is yet to choose.
