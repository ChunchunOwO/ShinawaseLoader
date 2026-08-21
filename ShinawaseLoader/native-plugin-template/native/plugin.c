#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "echo_native.h"

static const EchoNativeHost *g_host = NULL;

ECHO_NATIVE_EXPORT int EchoNative_Init(const EchoNativeHost *host, const EchoNativeInfo *info) {
  g_host = host;
  if (host && host->log) {
    char line[256];
    snprintf(line, sizeof(line), "example dll loaded for %s", info && info->package_id ? info->package_id : "unknown");
    host->log(host->ctx, ECHO_NATIVE_LOG_INFO, line);
  }
  return 0;
}

ECHO_NATIVE_EXPORT void EchoNative_Shutdown(void) {
  g_host = NULL;
}

ECHO_NATIVE_EXPORT int EchoNative_Invoke(const char *method, const char *json, char **out_json) {
  (void)json;
  const char *name = method && method[0] ? method : "status";
  char *text = (char *)malloc(160);
  if (!text) return 1;
  if (strcmp(name, "ping") == 0) snprintf(text, 160, "{\"ok\":true,\"from\":\"host-dll\"}");
  else snprintf(text, 160, "{\"ok\":true,\"method\":\"%s\"}", name);
  if (out_json) *out_json = text;
  else free(text);
  return 0;
}

ECHO_NATIVE_EXPORT void EchoNative_Free(char *value) {
  free(value);
}
