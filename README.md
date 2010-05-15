Swirl for Node (a port of my [Ruby version](http://github.com/bmizerany/swirl))
=====

Swirl is an EC2 version agnostic client for EC2 written in [Node.js](http://github.com/ry/node).
It gets out of your way.

The secret is it's simple input extraction are output compacting.  Your
input parameters and `expand`ed and EC2's (terrible) xml output is
`compact`ed.


Some simple examples:

    # Input
    { "InstanceId" : ["i-123k2h1", "i-0234d3"] }

is `expand`ed to:

    { "InstanceId.0" : "i-123k2h1", "InstanceId.1" : "i-0234d3" }

in the case that `.n` isn't at the end of the key:

    { "Foo.#.Bar" : ["a", "b"] }

is `expand`ed to:

    { "Foo.0.Bar" : "a", "Foo.1.Bar" : "b" }

and

    # Output
    {
      "reservationSet" : {
        "item" : {
          "instancesSet" : { "item" : [ ... ] }
        }
      }
    }

and it's varations are now `compact`ed to:

  {
    "reservationSet" : {
      "instancesSet" : [ { ... }, { ... } ]
    }
  }


Use
---

    var swirl = require("swirl") // add to your loadpath if needed
    ec2 = swirl.createEC2Client(my_key, my_secret)

    # Describe all instances
    ec2.call("DescribeInstances", {}, function(result) {
      var instances = result.reservationSet[0].instancesSet
      ...
    })

    # Describe specific instances
    var query = { "InstanceId" : ["i-38hdk2f", "i-93nndch"] }
    ec2.call("DescribeInstances", query, function(result) {
      var instances = result.reservationSet[0].instancesSet
      ...
    })
