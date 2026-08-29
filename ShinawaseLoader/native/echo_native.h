#ifndef ECHO_NATIVE_H
#define ECHO_NATIVE_H
/* EchoNative ABI for echo-steam 26.8.28. Build the loader addon against Electron 43.3.0. */

#include <stddef.h>
#include <stdint.h>

#ifdef _WIN32
#define ECHO_NATIVE_EXPORT __declspec(dllexport)
#else
#define ECHO_NATIVE_EXPORT __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

enum EchoNativeLogLevel {
  ECHO_NATIVE_LOG_DEBUG = 10,
  ECHO_NATIVE_LOG_INFO = 20,
  ECHO_NATIVE_LOG_WARN = 30,
  ECHO_NATIVE_LOG_ERROR = 40
};

enum EchoNativeProtect {
  ECHO_NATIVE_PROT_NONE = 0,
  ECHO_NATIVE_PROT_READ = 1,
  ECHO_NATIVE_PROT_WRITE = 2,
  ECHO_NATIVE_PROT_EXEC = 4
};

typedef struct EchoNativeInfo {
  const char *package_id;
  const char *package_dir;
  const char *config_json;
  const char *echo_root;
  int memory_api;
} EchoNativeInfo;

typedef struct EchoNativeHost {
  void (*log)(void *ctx, int level, const char *message);
  int (*call_js)(void *ctx, const char *method, const char *json, char **out_json);
  void (*free_string)(void *ctx, char *value);
  void *(*module_base)(void *ctx, const char *module_name);
  size_t (*module_size)(void *ctx, const char *module_name);
  int (*read_memory)(void *ctx, const void *src, void *dst, size_t size);
  int (*write_memory)(void *ctx, void *dst, const void *src, size_t size);
  int (*protect)(void *ctx, void *addr, size_t size, int prot, int *old_prot);
  void *ctx;
} EchoNativeHost;

typedef int (*EchoNativeInitFn)(const EchoNativeHost *host, const EchoNativeInfo *info);
typedef void (*EchoNativeShutdownFn)(void);
typedef int (*EchoNativeInvokeFn)(const char *method, const char *json, char **out_json);
typedef void (*EchoNativeFreeFn)(char *value);

ECHO_NATIVE_EXPORT int EchoNative_Init(const EchoNativeHost *host, const EchoNativeInfo *info);
ECHO_NATIVE_EXPORT void EchoNative_Shutdown(void);
ECHO_NATIVE_EXPORT int EchoNative_Invoke(const char *method, const char *json, char **out_json);
ECHO_NATIVE_EXPORT void EchoNative_Free(char *value);

#ifdef __cplusplus
}
#endif

#endif
