{
  "targets": [
    {
      "target_name": "echo-native-host",
      "sources": [ "echo-native-host.c" ],
      "include_dirs": [ "." ],
      "defines": [ "NAPI_VERSION=8" ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [ "-lpsapi" ]
        }]
      ]
    }
  ]
}
