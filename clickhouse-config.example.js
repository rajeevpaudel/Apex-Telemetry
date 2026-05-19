// Copy this file to clickhouse-config.js and fill in your credentials.
// The app uses mock data by default; setting this object switches it to live queries.
//
// Expected schema (dbt mart):
//   fact_qualifying  — season, round, driver_id, qualifying_position, q1/q2/q3,
//                      session_key, openf1_driver_number
//   dim_drivers      — driver_id, full_name, driver_code, permanent_number,
//                      team_name, team_colour (hex without #), headshot_initials

window.F1ClickHouseConfig = {
  url: "https://YOUR-HOST.clickhouse.cloud",   // no trailing slash
  username: "default",
  password: "YOUR-PASSWORD",
  database: "f1",
};
