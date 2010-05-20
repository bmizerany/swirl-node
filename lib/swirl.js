var sys = require("sys")
var http = require("http")
var qs = require("querystring")
var crypto = require("crypto")
var events = require("events")

var xml = require('./node-xml')

/* Creates and EC2 client with an SSL connection and creds */
exports.createEC2Client = function (access_key_id, secret_access_key) {
  var creds = crypto.createCredentials({})
  var host = "ec2.amazonaws.com"
  var c = new EC2Client()

  c.connection = http.createClient(443, host, true, creds)
  c.host = host
  c.access_key_id = access_key_id
  c.secret_access_key = secret_access_key
  return c
}

function EC2Client ( ) {}

exports.EC2Client = EC2Client

/*
 * Make a call to EC2
 *
 * action: (i.e. DescribeInstances)
 * query: { "InstanceId": "i-1234adsf' }
 * callback: function(resultObject) { ... }
 *
 */
EC2Client.prototype.call = function (action, query, callback) {
  if (this.secret_access_key == null || this.access_key_id == null) {
    throw("secret_access_key and access_key_id must be set")
  }

  var now = new Date()
  var ts = now.toISOString()

  /* expand */
  query = this.expand(query)

  /* Augment the query with common, required, parameters */
  query["Action"] = action
  query["Version"] = "2009-11-30"
  query["AWSAccessKeyId"] = this.access_key_id
  query["Timestamp"] = ts
  query["SignatureMethod"] = "HmacSHA256"
  query["SignatureVersion"] = "2"
  query["Signature"] = this.sign(query)

  var body = qs.stringify(query)

  var req = this.connection.request("POST", "/", {
    "Host": this.host,
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": body.length
  })

  var client = this
  var stack = []

  /*
   * Build a mini DOM, them compact and send
   * to the callback when finished
   */
  var parser = new xml.SaxParser(function  (cb) {
    cb.onStartElementNS(function (e) {
      stack.push({
        name: e,
        children: [],
        text: null
      })
    })

    cb.onCharacters(function (chars) {
      if (stack.length > 0)
        if (chars.replace(/[\t\n\s]/g, '').length > 0)
          stack[stack.length - 1].text = chars
    })

    cb.onEndElementNS(function (e) {
      if (stack.length > 1) {
        var temp = stack.pop()
        stack[stack.length - 1].children.unshift(temp)
      }
    })

    cb.onEndDocument(function () {
      var compacted = client.compact(stack.pop())
      callback(compacted)
    })
  })

  /*
   * Make the request and feed the response chunks
   * to the parser
   */
  req.addListener('response', function (res) {
    res.addListener('data', function (chunk) {
      parser.parseString(chunk.toString())
    })
  })

  req.write(body)
  req.end()
}

/*
 * Calculate and return the HMAC signature of
 * the query
 */
EC2Client.prototype.sign = function (query) {
  var hash = crypto.createHmac("sha256", this.secret_access_key)
  var keys = []
  var sorted = {}

  for(var key in query)
    keys.push(key)

  keys = keys.sort()

  for(n in keys) {
    var key = keys[n]
    sorted[key] = query[key]
  }

  var stringToSign = ["POST", this.host, "/", qs.stringify(sorted)].join("\n")
  return hash.update(stringToSign).digest("base64")
}

/*
 * Make assumptions about the values, based on
 * their type, and expand them to something
 * EC2 will understand.
 */
EC2Client.prototype.expand = function (query) {
  var exp = {}

  for (key in query) {
    var value = query[key]

    /* Array's mean a key/value sequence is needed */
    if (value instanceof Array) {

      /* ensure our key has a digit placeholder */
      if (key.indexOf("#") < 0)
        key = key + ".#"

      /* create the sequence key/values, like "InstanceId.#" => "InstanceId.1" */
      for (n in value)
        exp[key.replace("#", n)] = value[n]

    } else {

      /* Everything else stays as is */
      exp[key] = query[key]

    }
  }

  return exp
}

/*
 * Compact the resulting data from EC2 into
 * something more manageable.
 *
 * Example:
 *
 *   <DescribeInstancesResponse>
 *     <reservationSet>
 *       <item>
 *         <imageId>foo</imageId>
 *       </item>
 *     </reservationSet>
 *   </DescribeInstancesResponse>
 *
 *   will compact too
 *
 *   { reservationSet: [ { imageId: "foo" } ] }
 *
 *   which can be used like
 *
 *   reservationSet[0].imageId
 */
EC2Client.prototype.compact = function (o) {
  /*
   * The parent node is usless for our purposes and
   * only contains one child, ever.  Throw it away
   * and replace it with it with that child.
   */
  var shifted = o.children.shift()
  var result = {}

  result[shifted.name] = this._compact(shifted)
  return result
}

/*
 * Return an Array if the element can be deemed
 * as a Set, a Hash if children are present but
 * it's not a Set; otherwise a String
 */
EC2Client.prototype._compact = function (o) {
  var areItems = function (c) { return c.name == 'item' }
  var client = this

  if (o.children.length > 0) {
    if (o.children.some(areItems)) {
      /*
       * if there is an 'item' in the children,
       * it's safe to assume they are all items
       * and this is a Set
       */
      var result = o.children.map(function (c) {
        return client._compact(c)
      })
      return result
    } else {
      /*
       * A non-Set means the children are
       * associative maps
       */
      var result = {}
      for (n in o.children) {
        var child = o.children[n]
        result[child.name] = client._compact(child)
      }
      return result
    }
  }

  /*
   * No children means it's text value
   */
  return o.text
}
