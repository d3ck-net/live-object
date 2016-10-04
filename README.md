#live-object

the idea behind the live-object is to be able to create persistable entities
right out of the box while remaining fully configurable.

+ classes that inherit form live-object get a save and delete methods
+ a collection is created with the name of the object
+ collections get published automaticly
+ objects retrieved from the managed collection are atomaticly transformed into real object instances of you sub type.

the save and delete methods are isomorphic in their respective environment, eg
in the browser, on the meteor server and also in an node environment.

the meteor behaviour is mimiced inside the node envornment untilising the deasync library.

##how to use

###creating sub types:
```
var MongoObject = requiure('live-object');
var YourClass = MongoObject.createSubType({name:'YourClass'});
```
this will create a collection called "YourClasses".





###options

###use with nodejs

on the metoer server start the meteor wrapper:
```
MongoObject.registerDDPMethods([authenticatonCallback]);
```

on the node side of things call:
```
MongoObject.initNode({ddp:someDDPconnection});
```