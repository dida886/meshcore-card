// src/cli-commands.ts

export const CLI_COMMANDS: Record<string, string[]> = {
  // Device commands - no parameters
  send_appstart: [],
  send_device_query: [],
  reboot: [],
  get_bat: [],
  get_time: [],
  get_self_telemetry: [],
  get_custom_vars: [],
  export_private_key: [],
  sign_start: [],
  sign_finish: [],
  get_stats_core: [],
  get_stats_radio: [],
  get_stats_packets: [],
  get_allowed_repeat_freq: [],
  get_path_hash_mode: [],
  get_autoadd_config: [],

  // Contact commands
  get_contacts: ["int"],
  reset_path: ["contact"],
  share_contact: ["contact"],
  export_contact: ["contact"],
  remove_contact: ["contact"],
  import_contact: ["bytes"],
  update_contact: ["contact", "str", "str"],
  add_contact: ["contact"],
  change_contact_path: ["contact", "int"],
  change_contact_flags: ["contact", "int"],
  set_autoadd_config: ["int"],

  // Messaging commands
  get_msg: ["float"],
  send_login: ["contact", "str"],
  send_logout: ["contact"],
  send_statusreq: ["contact"],
  send_telemetry_req: ["contact"],
  send_msg: ["contact", "str", "int"],
  send_msg_with_retry: ["contact", "str"],
  send_chan_msg: ["int", "str", "int"],
  send_cmd: ["contact", "str", "int"],
  send_binary_req: ["contact", "int"],
  send_path_discovery: ["contact"],
  send_trace: ["int", "int", "int", "bytes"],
  set_flood_scope: ["str"],

  // Binary commands
  req_telemetry: ["contact", "int"],
  req_telemetry_sync: ["contact", "int"],
  req_mma: ["contact", "int", "int"],
  req_mma_sync: ["contact", "int", "int", "int"],
  req_acl: ["contact", "int"],
  req_acl_sync: ["contact", "int"],
  req_status: ["contact"],
  req_status_sync: ["contact"],
  req_neighbours_async: ["contact"],
  req_neighbours_sync: ["contact"],
  fetch_all_neighbours: ["contact"],
  req_regions_async: ["contact"],
  req_regions_sync: ["contact"],
  req_owner_async: ["contact"],
  req_owner_sync: ["contact"],
  req_basic_async: ["contact"],
  req_basic_sync: ["contact"],

  // Control data commands
  send_control_data: ["int", "bytes"],
  send_node_discover_req: ["int", "bool"],

  // Device configuration commands
  send_advert: ["bool"],
  set_name: ["str"],
  set_time: ["int"],
  set_tx_power: ["int"],
  set_devicepin: ["int"],
  set_multi_acks: ["int"],
  set_coords: ["float", "float"],
  set_radio: ["float", "float", "int", "int"],
  set_tuning: ["int", "int"],
  set_telemetry_mode_base: ["int"],
  set_telemetry_mode_loc: ["int"],
  set_telemetry_mode_env: ["int"],
  set_manual_add_contacts: ["bool"],
  set_advert_loc_policy: ["int"],
  set_other_params: ["bool", "int", "int", "int", "int"],
  set_custom_var: ["str", "str"],
  set_path_hash_mode: ["int"],
  import_private_key: ["bytes"],
  sign_data: ["bytes"],
  sign: ["bytes", "int"],
  get_channel: ["int"],
  set_channel: ["int", "str", "bytes"],
};

// Lista samych nazw komend do autouzupełniania
export const CLI_COMMAND_NAMES = Object.keys(CLI_COMMANDS);

// Funkcja pomocnicza – formatuje podpowiedź: nazwa(param1, param2)
export function formatCommandWithParams(name: string, params: string[]): string {
  if (params.length === 0) {
    return name + "()";
  }
  return name + "(" + params.join(", ") + ")";
}

// Znajduje komendę po nazwie
export function findCommand(name: string): { name: string; params: string[] } | undefined {
  const cleanName = name.split("(")[0].trim();
  const params = CLI_COMMANDS[cleanName];
  if (params === undefined) return undefined;
  return { name: cleanName, params };
}