# Troubleshooting

See the sibling page about [logging](./logging.md) for more information to help troubleshoot issues.

## Fatal crashes

### Heap space out-of-memory

These types of crashes will print something similar to this to the console:

```text
<--- Last few GCs --->

[5789:0x3f6eca0]    79353 ms: Scavenge 2020.1 (2075.5) -> 2016.5 (2076.5) MB, 9.57 / 0.00 ms  (average mu = 0.566, current mu = 0.422) allocation failure;
[5789:0x3f6eca0]    79403 ms: Scavenge 2021.2 (2076.5) -> 2018.3 (2079.5) MB, 11.10 / 0.00 ms  (average mu = 0.566, current mu = 0.422) allocation failure;
[5789:0x3f6eca0]    80721 ms: Scavenge 2024.0 (2079.5) -> 2020.6 (2097.0) MB, 1280.87 / 0.00 ms  (average mu = 0.566, current mu = 0.422) allocation failure;


<--- JS stacktrace --->

FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----

 1: 0xbd3a28 node::Abort() [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 2: 0xaa1af8  [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 3: 0xdfa1a0 v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*, v8::OOMDetails const&) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 4: 0xdfa574 v8::internal::V8::FatalProcessOutOfMemory(v8::internal::Isolate*, char const*, v8::OOMDetails const&) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 5: 0x10197b7  [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 6: 0x1031839 v8::internal::Heap::CollectGarbage(v8::internal::AllocationSpace, v8::internal::GarbageCollectionReason, v8::GCCallbackFlags) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 7: 0x100b547 v8::internal::HeapAllocator::AllocateRawWithLightRetrySlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 8: 0x100c184 v8::internal::HeapAllocator::AllocateRawWithRetryOrFailSlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
 9: 0xfec37e v8::internal::Factory::NewFillerObject(int, v8::internal::AllocationAlignment, v8::internal::AllocationType, v8::internal::AllocationOrigin) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
10: 0x143b35c v8::internal::Runtime_AllocateInYoungGeneration(int, unsigned long*, v8::internal::Isolate*) [/nix/store/d6lkbndr98lcn8spbqxfq52f2ldvqhks-nodejs-20.11.0/bin/node]
11: 0x7fe14fed9ef6
```

The issue is that Igir ran out of memory likely due to low system limits, large DAT packs, or large ROM collections.

You likely need to process your ROM collection in batches, just be careful when using the [`igir clean` command](../commands.md). If you don't need every DAT from a pack, you can try reducing the number of DATs being processed with the [`--dat-*-regex <pattern>` and `--dat-*-regex-exclude <pattern>` options](../dats/processing.md#dat-filtering) like this:

```shell
igir [commands..] --dat "*.dat" --dat-name-regex "/nintendo/i"
```

You can also try increasing V8's "old memory" limit above [Node.js' default (version dependent)](https://medium.com/geekculture/node-js-default-memory-settings-3c0fe8a9ba1) to ~75% of your system's available RAM in megabytes like this:

```shell
npx --node-options='--max-old-space-size=6144' igir@latest [commands..] [options]
```
