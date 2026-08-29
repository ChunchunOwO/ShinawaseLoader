/* N-API host addon for echo-steam 26.8.28 / Electron 43.3.0 (Chromium 150). */
#define NAPI_VERSION 8
#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "echo_native.h"

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#else
#include <dlfcn.h>
#endif

#define MAX_HANDLES 64
#define MAX_READ 8 * 1024 * 1024

typedef struct NativeHandle {
  int used;
  int memory_api;
#ifdef _WIN32
  HMODULE module;
#else
  void *module;
#endif
  EchoNativeShutdownFn shutdown;
  EchoNativeInvokeFn invoke;
  EchoNativeFreeFn free_fn;
} NativeHandle;

static NativeHandle handles[MAX_HANDLES];
static int memory_api_global = 1;

static int alloc_handle(void) {
  for (int i = 0; i < MAX_HANDLES; i++) {
    if (!handles[i].used) {
      memset(&handles[i], 0, sizeof(handles[i]));
      handles[i].used = 1;
      return i + 1;
    }
  }
  return 0;
}

static NativeHandle *get_handle(int id) {
  if (id <= 0 || id > MAX_HANDLES || !handles[id - 1].used) return NULL;
  return &handles[id - 1];
}

static void host_log(void *ctx, int level, const char *message) {
  (void)ctx;
  (void)level;
  (void)message;
}

static int host_call_js(void *ctx, const char *method, const char *json, char **out_json) {
  (void)ctx;
  (void)method;
  (void)json;
  if (out_json) *out_json = NULL;
  return -1;
}

static void host_free_string(void *ctx, char *value) {
  (void)ctx;
  free(value);
}

#ifdef _WIN32
static int wide_from_utf8(const char *text, WCHAR *out, int out_chars) {
  return MultiByteToWideChar(CP_UTF8, 0, text, -1, out, out_chars);
}

static void *current_module_base(const char *module_name, size_t *size_out) {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
  MODULEENTRY32W entry;
  WCHAR wide[MAX_PATH];
  if (snapshot == INVALID_HANDLE_VALUE) return NULL;
  entry.dwSize = sizeof(entry);
  if (module_name && module_name[0]) wide_from_utf8(module_name, wide, MAX_PATH);
  if (Module32FirstW(snapshot, &entry)) {
    do {
      if (!module_name || !module_name[0] || _wcsicmp(entry.szModule, wide) == 0) {
        if (size_out) *size_out = entry.modBaseSize;
        CloseHandle(snapshot);
        return entry.modBaseAddr;
      }
    } while (Module32NextW(snapshot, &entry));
  }
  CloseHandle(snapshot);
  return NULL;
}

static DWORD win_protect(int prot) {
  int read = prot & ECHO_NATIVE_PROT_READ;
  int write = prot & ECHO_NATIVE_PROT_WRITE;
  int exec = prot & ECHO_NATIVE_PROT_EXEC;
  if (exec && write) return PAGE_EXECUTE_READWRITE;
  if (exec && read) return PAGE_EXECUTE_READ;
  if (exec) return PAGE_EXECUTE;
  if (write) return PAGE_READWRITE;
  if (read) return PAGE_READONLY;
  return PAGE_NOACCESS;
}

static int from_win_protect(DWORD prot) {
  switch (prot) {
    case PAGE_EXECUTE_READWRITE:
    case PAGE_EXECUTE_WRITECOPY:
      return ECHO_NATIVE_PROT_READ | ECHO_NATIVE_PROT_WRITE | ECHO_NATIVE_PROT_EXEC;
    case PAGE_EXECUTE_READ:
      return ECHO_NATIVE_PROT_READ | ECHO_NATIVE_PROT_EXEC;
    case PAGE_EXECUTE:
      return ECHO_NATIVE_PROT_EXEC;
    case PAGE_READWRITE:
    case PAGE_WRITECOPY:
      return ECHO_NATIVE_PROT_READ | ECHO_NATIVE_PROT_WRITE;
    case PAGE_READONLY:
      return ECHO_NATIVE_PROT_READ;
    default:
      return ECHO_NATIVE_PROT_NONE;
  }
}
#endif

static void *host_module_base(void *ctx, const char *module_name) {
  (void)ctx;
#ifdef _WIN32
  return current_module_base(module_name, NULL);
#else
  (void)module_name;
  return NULL;
#endif
}

static size_t host_module_size(void *ctx, const char *module_name) {
  (void)ctx;
#ifdef _WIN32
  size_t size = 0;
  current_module_base(module_name, &size);
  return size;
#else
  (void)module_name;
  return 0;
#endif
}

static int host_read_memory(void *ctx, const void *src, void *dst, size_t size) {
  (void)ctx;
  if (!src || !dst || !size || size > MAX_READ) return 0;
  memcpy(dst, src, size);
  return 1;
}

static int host_write_memory(void *ctx, void *dst, const void *src, size_t size) {
  (void)ctx;
  if (!dst || !src || !size || size > MAX_READ) return 0;
  memcpy(dst, src, size);
  return 1;
}

static int host_protect(void *ctx, void *addr, size_t size, int prot, int *old_prot) {
  (void)ctx;
#ifdef _WIN32
  DWORD old = 0;
  if (!addr || !size) return 0;
  if (!VirtualProtect(addr, size, win_protect(prot), &old)) return 0;
  if (old_prot) *old_prot = from_win_protect(old);
  return 1;
#else
  (void)addr;
  (void)size;
  (void)prot;
  (void)old_prot;
  return 0;
#endif
}

static EchoNativeHost make_host(void) {
  EchoNativeHost host;
  memset(&host, 0, sizeof(host));
  host.log = host_log;
  host.call_js = host_call_js;
  host.free_string = host_free_string;
  host.module_base = host_module_base;
  host.module_size = host_module_size;
  host.read_memory = host_read_memory;
  host.write_memory = host_write_memory;
  host.protect = host_protect;
  return host;
}

static napi_value throw_error(napi_env env, const char *code) {
  napi_throw_error(env, NULL, code);
  return NULL;
}

static char *read_utf8(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, NULL, 0, &length) != napi_ok) return NULL;
  char *text = (char *)malloc(length + 1);
  if (!text) return NULL;
  if (napi_get_value_string_utf8(env, value, text, length + 1, &length) != napi_ok) {
    free(text);
    return NULL;
  }
  return text;
}

static napi_value js_load(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc < 1) return throw_error(env, "native_dll_path_required");
  char *path = read_utf8(env, args[0]);
  if (!path) return throw_error(env, "native_dll_path_invalid");
  EchoNativeInfo native_info;
  memset(&native_info, 0, sizeof(native_info));
  native_info.memory_api = memory_api_global;
  char *package_id = NULL;
  char *package_dir = NULL;
  char *config_json = NULL;
  char *echo_root = NULL;
  if (argc >= 2) {
    napi_value field;
    if (napi_get_named_property(env, args[1], "package_id", &field) == napi_ok) package_id = read_utf8(env, field);
    if (napi_get_named_property(env, args[1], "package_dir", &field) == napi_ok) package_dir = read_utf8(env, field);
    if (napi_get_named_property(env, args[1], "config_json", &field) == napi_ok) config_json = read_utf8(env, field);
    if (napi_get_named_property(env, args[1], "echo_root", &field) == napi_ok) echo_root = read_utf8(env, field);
    int32_t memory_api = 1;
    if (napi_get_named_property(env, args[1], "memory_api", &field) == napi_ok) napi_get_value_int32(env, field, &memory_api);
    native_info.memory_api = memory_api;
  }
  native_info.package_id = package_id ? package_id : "";
  native_info.package_dir = package_dir ? package_dir : "";
  native_info.config_json = config_json ? config_json : "{}";
  native_info.echo_root = echo_root ? echo_root : "";

  int id = alloc_handle();
  if (!id) {
    free(path); free(package_id); free(package_dir); free(config_json); free(echo_root);
    return throw_error(env, "native_handle_exhausted");
  }
  NativeHandle *handle = get_handle(id);
  handle->memory_api = native_info.memory_api;
#ifdef _WIN32
  WCHAR wide[4096];
  if (!wide_from_utf8(path, wide, 4096)) {
    handle->used = 0;
    free(path); free(package_id); free(package_dir); free(config_json); free(echo_root);
    return throw_error(env, "native_dll_path_invalid");
  }
  handle->module = LoadLibraryW(wide);
#else
  handle->module = dlopen(path, RTLD_NOW);
#endif
  if (!handle->module) {
    handle->used = 0;
    free(path); free(package_id); free(package_dir); free(config_json); free(echo_root);
    return throw_error(env, "native_dll_load_failed");
  }
#ifdef _WIN32
  EchoNativeInitFn init = (EchoNativeInitFn)GetProcAddress(handle->module, "EchoNative_Init");
  handle->shutdown = (EchoNativeShutdownFn)GetProcAddress(handle->module, "EchoNative_Shutdown");
  handle->invoke = (EchoNativeInvokeFn)GetProcAddress(handle->module, "EchoNative_Invoke");
  handle->free_fn = (EchoNativeFreeFn)GetProcAddress(handle->module, "EchoNative_Free");
#else
  EchoNativeInitFn init = (EchoNativeInitFn)dlsym(handle->module, "EchoNative_Init");
  handle->shutdown = (EchoNativeShutdownFn)dlsym(handle->module, "EchoNative_Shutdown");
  handle->invoke = (EchoNativeInvokeFn)dlsym(handle->module, "EchoNative_Invoke");
  handle->free_fn = (EchoNativeFreeFn)dlsym(handle->module, "EchoNative_Free");
#endif
  if (!init) {
#ifdef _WIN32
    FreeLibrary(handle->module);
#else
    dlclose(handle->module);
#endif
    handle->used = 0;
    free(path); free(package_id); free(package_dir); free(config_json); free(echo_root);
    return throw_error(env, "EchoNative_Init_missing");
  }
  EchoNativeHost host = make_host();
  int result = init(&host, &native_info);
  free(path); free(package_id); free(package_dir); free(config_json); free(echo_root);
  if (result != 0) {
#ifdef _WIN32
    FreeLibrary(handle->module);
#else
    dlclose(handle->module);
#endif
    handle->used = 0;
    return throw_error(env, "EchoNative_Init_failed");
  }
  napi_value out;
  napi_create_int32(env, id, &out);
  return out;
}

static napi_value js_unload(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  int32_t id = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc < 1 || napi_get_value_int32(env, args[0], &id) != napi_ok) return throw_error(env, "native_handle_invalid");
  NativeHandle *handle = get_handle(id);
  if (!handle) return throw_error(env, "native_handle_missing");
  if (handle->shutdown) handle->shutdown();
#ifdef _WIN32
  if (handle->module) FreeLibrary(handle->module);
#else
  if (handle->module) dlclose(handle->module);
#endif
  handle->used = 0;
  napi_value out;
  napi_get_boolean(env, 1, &out);
  return out;
}

static napi_value js_invoke(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  int32_t id = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc < 3 || napi_get_value_int32(env, args[0], &id) != napi_ok) return throw_error(env, "native_invoke_invalid");
  NativeHandle *handle = get_handle(id);
  if (!handle || !handle->invoke) return throw_error(env, "native_invoke_missing");
  char *method = read_utf8(env, args[1]);
  char *json = read_utf8(env, args[2]);
  char *out_json = NULL;
  int result = handle->invoke(method ? method : "", json ? json : "{}", &out_json);
  free(method);
  free(json);
  if (result != 0) {
    if (out_json && handle->free_fn) handle->free_fn(out_json);
    else free(out_json);
    return throw_error(env, "native_invoke_failed");
  }
  napi_value out;
  napi_create_string_utf8(env, out_json ? out_json : "{}", NAPI_AUTO_LENGTH, &out);
  if (out_json && handle->free_fn) handle->free_fn(out_json);
  else free(out_json);
  return out;
}

static napi_value js_modules(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value list;
  napi_create_array(env, &list);
#ifdef _WIN32
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, GetCurrentProcessId());
  MODULEENTRY32W entry;
  uint32_t index = 0;
  if (snapshot == INVALID_HANDLE_VALUE) return list;
  entry.dwSize = sizeof(entry);
  if (Module32FirstW(snapshot, &entry)) {
    do {
      char name[MAX_PATH];
      char base[32];
      WideCharToMultiByte(CP_UTF8, 0, entry.szModule, -1, name, MAX_PATH, NULL, NULL);
      snprintf(base, sizeof(base), "0x%p", entry.modBaseAddr);
      napi_value item, name_v, base_v, size_v;
      napi_create_object(env, &item);
      napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &name_v);
      napi_create_string_utf8(env, base, NAPI_AUTO_LENGTH, &base_v);
      napi_create_uint32(env, entry.modBaseSize, &size_v);
      napi_set_named_property(env, item, "name", name_v);
      napi_set_named_property(env, item, "base", base_v);
      napi_set_named_property(env, item, "size", size_v);
      napi_set_element(env, list, index++, item);
    } while (Module32NextW(snapshot, &entry));
  }
  CloseHandle(snapshot);
#endif
  return list;
}

static void *resolve_address(const char *module_name, size_t offset, size_t *module_size) {
#ifdef _WIN32
  void *base = current_module_base(module_name, module_size);
  if (!base) return NULL;
  return (unsigned char *)base + offset;
#else
  (void)module_name;
  (void)offset;
  (void)module_size;
  return NULL;
#endif
}

static int hex_nibble(int ch) {
  if (ch >= '0' && ch <= '9') return ch - '0';
  if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
  if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
  return -1;
}

static int is_pattern_space(char ch) {
  return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';
}

static int parse_scan_pattern(const char *pattern, unsigned char **bytes_out, unsigned char **mask_out, size_t *len_out) {
  size_t cap = 0;
  const char *p;
  unsigned char *bytes;
  unsigned char *mask;
  size_t n = 0;
  if (!pattern || !bytes_out || !mask_out || !len_out) return 0;
  *bytes_out = NULL;
  *mask_out = NULL;
  *len_out = 0;
  for (p = pattern; *p;) {
    while (*p && is_pattern_space(*p)) p++;
    if (!*p) break;
    cap++;
    while (*p && !is_pattern_space(*p)) p++;
  }
  if (!cap) return 0;
  bytes = (unsigned char *)malloc(cap);
  mask = (unsigned char *)malloc(cap);
  if (!bytes || !mask) {
    free(bytes);
    free(mask);
    return 0;
  }
  for (p = pattern; *p;) {
    char tok[8];
    size_t tlen = 0;
    while (*p && is_pattern_space(*p)) p++;
    if (!*p) break;
    while (*p && !is_pattern_space(*p)) {
      if (tlen + 1 < sizeof(tok)) tok[tlen++] = *p;
      else tlen++;
      p++;
    }
    tok[tlen < sizeof(tok) ? tlen : sizeof(tok) - 1] = 0;
    if (tlen == 0 || tlen >= sizeof(tok)) {
      free(bytes);
      free(mask);
      return 0;
    }
    if ((tlen == 1 && tok[0] == '?') || (tlen == 2 && tok[0] == '?' && tok[1] == '?')) {
      bytes[n] = 0;
      mask[n] = 0;
      n++;
      continue;
    }
    if (tlen == 1) {
      int lo = hex_nibble((unsigned char)tok[0]);
      if (lo < 0) {
        free(bytes);
        free(mask);
        return 0;
      }
      bytes[n] = (unsigned char)lo;
      mask[n] = 1;
      n++;
      continue;
    }
    if (tlen == 2) {
      int hi = hex_nibble((unsigned char)tok[0]);
      int lo = hex_nibble((unsigned char)tok[1]);
      if (hi < 0 || lo < 0) {
        free(bytes);
        free(mask);
        return 0;
      }
      bytes[n] = (unsigned char)((hi << 4) | lo);
      mask[n] = 1;
      n++;
      continue;
    }
    free(bytes);
    free(mask);
    return 0;
  }
  if (!n) {
    free(bytes);
    free(mask);
    return 0;
  }
  *bytes_out = bytes;
  *mask_out = mask;
  *len_out = n;
  return 1;
}

#ifdef _WIN32
static int region_is_readable(DWORD protect) {
  DWORD page;
  if (protect & PAGE_GUARD) return 0;
  page = protect & 0xFF;
  switch (page) {
    case PAGE_READONLY:
    case PAGE_READWRITE:
    case PAGE_WRITECOPY:
    case PAGE_EXECUTE_READ:
    case PAGE_EXECUTE_READWRITE:
    case PAGE_EXECUTE_WRITECOPY:
      return 1;
    default:
      return 0;
  }
}
#endif

static napi_value js_read(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  int64_t offset = 0;
  int64_t size = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc < 3) return throw_error(env, "native_read_invalid");
  char *module_name = read_utf8(env, args[0]);
  napi_get_value_int64(env, args[1], &offset);
  napi_get_value_int64(env, args[2], &size);
  if (!memory_api_global || size <= 0 || size > MAX_READ) {
    free(module_name);
    return throw_error(env, "native_memory_disabled");
  }
  size_t module_size = 0;
  void *src = resolve_address(module_name, (size_t)offset, &module_size);
  free(module_name);
  if (!src || (module_size && (size_t)offset + (size_t)size > module_size)) return throw_error(env, "native_read_range");
  void *buffer = NULL;
  napi_value out;
  if (napi_create_buffer_copy(env, (size_t)size, src, &buffer, &out) != napi_ok) return throw_error(env, "native_read_failed");
  return out;
}

static napi_value js_write(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  int64_t offset = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc < 3) return throw_error(env, "native_write_invalid");
  char *module_name = read_utf8(env, args[0]);
  napi_get_value_int64(env, args[1], &offset);
  void *data = NULL;
  size_t size = 0;
  if (napi_get_buffer_info(env, args[2], &data, &size) != napi_ok || !data || !size) {
    free(module_name);
    return throw_error(env, "native_write_buffer_invalid");
  }
  if (!memory_api_global || size > MAX_READ) {
    free(module_name);
    return throw_error(env, "native_memory_disabled");
  }
  size_t module_size = 0;
  void *dst = resolve_address(module_name, (size_t)offset, &module_size);
  free(module_name);
  if (!dst || (module_size && (size_t)offset + size > module_size)) return throw_error(env, "native_write_range");
  memcpy(dst, data, size);
  napi_value out;
  napi_create_uint32(env, (uint32_t)size, &out);
  return out;
}

static napi_value js_protect(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  int64_t offset = 0;
  int64_t size = 0;
  int32_t prot = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc < 4) return throw_error(env, "native_protect_invalid");
  char *module_name = read_utf8(env, args[0]);
  napi_get_value_int64(env, args[1], &offset);
  napi_get_value_int64(env, args[2], &size);
  napi_get_value_int32(env, args[3], &prot);
  size_t module_size = 0;
  void *addr = resolve_address(module_name, (size_t)offset, &module_size);
  free(module_name);
  if (!memory_api_global) return throw_error(env, "native_memory_disabled");
  int old_prot = 0;
  if (!host_protect(NULL, addr, (size_t)size, prot, &old_prot)) return throw_error(env, "native_protect_failed");
  napi_value out, old_v;
  napi_create_object(env, &out);
  napi_create_int32(env, old_prot, &old_v);
  napi_set_named_property(env, out, "oldProt", old_v);
  return out;
}

static napi_value js_scan(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_value list;
  uint32_t limit = 0;
  char *module_name = NULL;
  char *pattern = NULL;
  unsigned char *pat = NULL;
  unsigned char *mask = NULL;
  size_t pat_len = 0;
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (!memory_api_global) return throw_error(env, "native_memory_disabled");
  if (argc < 2) return throw_error(env, "native_scan_pattern_invalid");
  module_name = read_utf8(env, args[0]);
  pattern = read_utf8(env, args[1]);
  if (argc >= 3) napi_get_value_uint32(env, args[2], &limit);
  if (!parse_scan_pattern(pattern, &pat, &mask, &pat_len)) {
    free(module_name);
    free(pattern);
    return throw_error(env, "native_scan_pattern_invalid");
  }
  napi_create_array(env, &list);
#ifdef _WIN32
  {
    size_t module_size = 0;
    const char *mod_arg = (module_name && module_name[0]) ? module_name : NULL;
    void *base = current_module_base(mod_arg, &module_size);
    if (base && module_size >= pat_len) {
      unsigned char *mod_base = (unsigned char *)base;
      unsigned char *mod_end = mod_base + module_size;
      unsigned char *cursor = mod_base;
      uint32_t found = 0;
      int stop = 0;
      while (cursor < mod_end && !stop) {
        MEMORY_BASIC_INFORMATION mbi;
        unsigned char *region_start;
        unsigned char *region_end;
        unsigned char *scan_start;
        unsigned char *scan_end;
        unsigned char *next;
        if (!VirtualQuery(cursor, &mbi, sizeof(mbi))) {
          cursor += 0x1000;
          continue;
        }
        if (!mbi.RegionSize) {
          cursor += 0x1000;
          continue;
        }
        region_start = (unsigned char *)mbi.BaseAddress;
        region_end = region_start + mbi.RegionSize;
        scan_start = region_start < mod_base ? mod_base : region_start;
        scan_end = region_end > mod_end ? mod_end : region_end;
        if (mbi.State == MEM_COMMIT && region_is_readable(mbi.Protect) && scan_end > scan_start) {
          size_t hay_len = (size_t)(scan_end - scan_start);
          if (hay_len >= pat_len) {
            size_t max_i = hay_len - pat_len;
            size_t i;
            for (i = 0; i <= max_i; i++) {
              size_t j;
              int ok = 1;
              for (j = 0; j < pat_len; j++) {
                if (mask[j] && scan_start[i + j] != pat[j]) {
                  ok = 0;
                  break;
                }
              }
              if (ok) {
                char addr_text[32];
                unsigned char *addr = scan_start + i;
                napi_value item, addr_v, offset_v;
                snprintf(addr_text, sizeof(addr_text), "0x%p", (void *)addr);
                napi_create_object(env, &item);
                napi_create_string_utf8(env, addr_text, NAPI_AUTO_LENGTH, &addr_v);
                napi_create_int64(env, (int64_t)(addr - mod_base), &offset_v);
                napi_set_named_property(env, item, "address", addr_v);
                napi_set_named_property(env, item, "offset", offset_v);
                napi_set_element(env, list, found, item);
                found++;
                if (limit > 0 && found >= limit) {
                  stop = 1;
                  break;
                }
              }
            }
          }
        }
        next = (unsigned char *)mbi.BaseAddress + mbi.RegionSize;
        if (next <= cursor) next = cursor + 0x1000;
        cursor = next;
      }
    }
  }
#endif
  free(module_name);
  free(pattern);
  free(pat);
  free(mask);
  return list;
}

static napi_value init_addon(napi_env env, napi_value exports) {
  struct { const char *name; napi_callback fn; } methods[] = {
    { "load", js_load },
    { "unload", js_unload },
    { "invoke", js_invoke },
    { "modules", js_modules },
    { "read", js_read },
    { "write", js_write },
    { "protect", js_protect },
    { "scan", js_scan },
  };
  for (size_t i = 0; i < sizeof(methods) / sizeof(methods[0]); i++) {
    napi_value fn;
    napi_create_function(env, methods[i].name, NAPI_AUTO_LENGTH, methods[i].fn, NULL, &fn);
    napi_set_named_property(env, exports, methods[i].name, fn);
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init_addon)
