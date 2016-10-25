var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("VoteOff error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("VoteOff error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("VoteOff contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of VoteOff: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to VoteOff.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: VoteOff not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [],
        "name": "getCurrentVoters",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "currentVoters",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "currentProposalIndex",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "closeVote",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "votingIsOpen",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "getCurrentProposal",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          },
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "getResults",
        "outputs": [
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "uint256"
          },
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "voteIndex",
            "type": "uint256"
          },
          {
            "name": "voterId",
            "type": "string"
          },
          {
            "name": "option",
            "type": "int256"
          }
        ],
        "name": "submitVote",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "nextVote",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      }
    ],
    "unlinked_binary": "0x600060028181556003805460ff191690558154600160a060020a03191633178255600d60e09081527f44656e6e6973205461796c6f720000000000000000000000000000000000000061010090815260a091825260c084905260608281526101a0604052600c6101609081527f5461796c6f7220537769667400000000000000000000000000000000000000006101805261012090815261014086905260805260058054958190527f44656e6e6973205461796c6f720000000000000000000000000000000000001a81559094909384928392610128927f036b6384b5eca791c62761152d0c79bb0604c104a5fb6f4eb0703f3154bb3db0602060018416159094026000190190921604601f01919091048101905b808211156101955760008155600101610114565b5050602091820151600191820155838201518051805160028681018054600082815288902095979196879690821615610100026000190190911692909204601f9081018290048301949091019083901061019957805160ff19168380011785555b506101c9929150610114565b5090565b82800160010185558215610189579182015b828111156101895782518260005055916020019190600101906101ab565b50506020918201516001918201556040805160c081018252600560808281018281527f4d6172696f00000000000000000000000000000000000000000000000000000060a085015283850190815260006060858101829052918552855192830186529482019283527f536f6e69630000000000000000000000000000000000000000000000000000009082015290815280850183905281850152805180518051600980549581905293985092965090948694859460029181161561010002600019011604601f9081018290047f6e1540171b6c0c960b71a7020d9f60077f6af931a8bbf590da0223dacf75c7af9081019493909201908390106102df57805160ff19168380011785555b5061030f929150610114565b828001600101855582156102d3579182015b828111156102d35782518260005055916020019190600101906102f1565b5050602091820151600191820155838201518051805160028681018054600082815288902095979196879690821615610100026000190190911692909204601f9081018290048301949091019083901061037c57805160ff19168380011785555b506103ac929150610114565b82800160010185558215610370579182015b8281111561037057825182600050559160200191906001019061038e565b50506020918201516001918201556040805160c081018252600360808281019182527f546561000000000000000000000000000000000000000000000000000000000060a0840152828401918252600060608481018290529284528451918201855260069482019485527f436f6666656500000000000000000000000000000000000000000000000000009282019290925292835282850181905281850192909252805180518051600d80549581905293985092965090948694859460029181161561010002600019011604601f9081018290047fd7b6990105719101dabeb77144f2a3385c8033acd3af97e9423a695e81ad1eb59081019493909201908390106104ca57805160ff19168380011785555b506104fa929150610114565b828001600101855582156104be579182015b828111156104be5782518260005055916020019190600101906104dc565b5050602091820151600191820155838201518051805160028681018054600082815288902095979196879690821615610100026000190190911692909204601f9081018290048301949091019083901061056757805160ff19168380011785555b50610597929150610114565b8280016001018555821561055b579182015b8281111561055b578251826000505591602001919060010190610579565b50506020918201516001918201556040805160c081018252600260808281018281527f432300000000000000000000000000000000000000000000000000000000000060a0850152838501908152600060608581018290529185528551928301865260049583019586527f4a61766100000000000000000000000000000000000000000000000000000000918301919091529381528086018490528286015281518051805160118054968190529499509397509095879586959081161561010002600019011692909204601f9081018390047f31ecc21a745e3968a04e9570e4425bc18fa8019c68028196b546d1669c200c689081019493909201908390106106b357805160ff19168380011785555b506106e3929150610114565b828001600101855582156106a7579182015b828111156106a75782518260005055916020019190600101906106c5565b5050602091820151600191820155838201518051805160028681018054600082815288902095979196879690821615610100026000190190911692909204601f9081018290048301949091019083901061075057805160ff19168380011785555b50610780929150610114565b82800160010185558215610744579182015b82811115610744578251826000505591602001919060010190610762565b50506020918201516001918201556040805160c081018252600760808281019182527f4e657462616c6c0000000000000000000000000000000000000000000000000060a0840152828401918252600060608481018290529284528451918201855260089482019485527f44726573736167650000000000000000000000000000000000000000000000009282019290925292835282850181905281850192909252805180518051601580549581905293985092965090948694859460029181161561010002600019011604601f9081018290047f55f448fdea98c4d29eb340757ef0a66cd03dbb9538908a6a81d96026b71ec47590810194939092019083901061089e57805160ff19168380011785555b506108ce929150610114565b82800160010185558215610892579182015b828111156108925782518260005055916020019190600101906108b0565b5050602091820151600191820155838201518051805160028681018054600082815288902095979196879690821615610100026000190190911692909204601f9081018290048301949091019083901061093b57805160ff19168380011785555b5061096b929150610114565b8280016001018555821561092f579182015b8281111561092f57825182600050559160200191906001019061094d565b5050602091909101516001918201556003805460ff191690911790555050610b83806109976000396000f3606060405236156100775760e060020a60003504630494c395811461007c5780631a6265021461009757806331835fb814610132578063329d3346146101405780633e4ed3d1146101c357806341ec6870146101d45780634717f97c14610279578063ebc45dde1461033a578063f24f4cf4146103a8575b610002565b34610002576004545b60408051918252519081900360200190f35b346100025761042b6004356004805482908110156100025750600052604080517f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b929092018054602060026001831615610100026000190190921691909104601f81018290048202850182019093528284529091908301828280156106895780601f1061065e57610100808354040283529160200191610689565b346100025761008560025481565b34610002576104996003805460ff19169055600080805b60045460ff84161015610691576004805460ff851690811015610002579060005260206000209001600050915060016000508260405180828054600181600116156101000203166002900480156106b85780601f106106965761010080835404028352918201916106b8565b346100025761049b60035460ff1681565b34610002576104af604080516020818101835260008083528351918201909352828152600254600581818110156100025750600482028101908281811015610002575050604080518254602060026001831615610100026000190190921691909104601f8101829004820283018201909352828252600760048602019284918301828280156107585780601f1061072d57610100808354040283529160200191610758565b346100025761058360408051602081810183526000808352835191820190935282815260025491929182908190819060059081811015610002576004810282019350818110156100025760040201600050604080516001858101546003850154875460206002948216156101000260001901909116849004601f8101829004820286018201909652858552959092019550869490938693918691908301828280156108255780601f106107fa57610100808354040283529160200191610825565b346100025760408051602060248035600481810135601f810185900485028601850190965285855261049b95813595919460449492939092019181908401838280828437509496505093359350505050600354600090819060ff16156108ca5760025485146108d7576108cf565b34610002576104996002805460010190556000805b60045460ff83161015610aaa576004805460ff841690811015610002579060005260206000209001600050905060006001600050826040518082805460018160011615610100020316600290048015610af85780601f10610ad6576101008083540402835291820191610af8565b60405180806020018281038252838181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f16801561048b5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b005b604080519115158252519081900360200190f35b6040518084815260200180602001806020018381038352858181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156105195780820380516001836020036101000a031916815260200191505b508381038252848181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156105725780820380516001836020036101000a031916815260200191505b509550505050505060405180910390f35b6040518080602001858152602001806020018481526020018381038352878181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f1680156105f35780820380516001836020036101000a031916815260200191505b508381038252858181518152602001915080519060200190808383829060006004602084601f0104600302600f01f150905090810190601f16801561064c5780820380516001836020036101000a031916815260200191505b50965050505050505060405180910390f35b820191906000526020600020905b81548152906001019060200180831161066c57829003601f168201915b505050505081565b505050565b820191906000526020600020905b8154815290600101906020018083116106a4575b505092835250506040519081900360200190205490506000198114156106fb57600254600590818110156100025760040201600190810180549091019055610721565b806001141561072157600254600590818110156100025760040201600301805460010190555b60019290920191610157565b820191906000526020600020905b81548152906001019060200180831161073b57829003601f168201915b5050604080518654602060026001831615610100026000190190921691909104601f81018290048202830182019093528282529597509486945090925084019050828280156107e85780601f106107bd576101008083540402835291602001916107e8565b820191906000526020600020905b8154815290600101906020018083116107cb57829003601f168201915b50505050509050925092509250909192565b820191906000526020600020905b81548152906001019060200180831161080857829003601f168201915b5050855460408051602060026001851615610100026000190190941693909304601f8101849004840282018401909252818152959950879450925084019050828280156108b35780601f10610888576101008083540402835291602001916108b3565b820191906000526020600020905b81548152906001019060200180831161089657829003601f168201915b505050505091509550955095509550505090919293565b600091505b509392505050565b600160005084604051808280519060200190808383829060006004602084601f0104600302600f01f1509050019150509081526020016040518091039020600050549050806000141561095857600480546001810180835582818380158290116109a7578183600052602060002091820191016109a79190610a16565b5050505b82600160005085604051808280519060200190808383829060006004602084601f0104600302600f01f150905001915050908152602001604051809103902060005081905550600191506108cf565b5050509190906000526020600020900160008690919091509080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f10610a7a57805160ff19168380011785555b50610954929150610a62565b50506001015b80821115610a76576000818150805460018160011615610100020316600290046000825580601f10610a485750610a10565b601f016020900490600052602060002090810190610a1091905b80821115610a765760008155600101610a62565b5090565b82800160010185558215610a04579182015b82811115610a04578251826000505591602001919060010190610a8c565b6000600460005081815481835581811511610b1857600083815260209020610b18918101908301610b33565b820191906000526020600020905b815481529060010190602001808311610ae4575b5050928352505060405190819003602001902055600191909101906103bd565b50506003805460ff1916600117905550505050565b50506001015b80821115610a76576000818150805460018160011615610100020316600290046000825580601f10610b655750610b2d565b601f016020900490600052602060002090810190610b2d9190610a6256",
    "events": {},
    "updated_at": 1477408543657,
    "links": {},
    "address": "0x9090d30113576e253e667a70055a841d9cf649ae"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "VoteOff";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.VoteOff = Contract;
  }
})();
