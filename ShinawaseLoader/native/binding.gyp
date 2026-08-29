{
  "variables": {
    "echo_target_electron%": "43.3.0",
    "echo_aligned_app%": "26.8.28"
  },
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
