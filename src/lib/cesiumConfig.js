import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// Cesium ion access token. This is inherently a client-side credential — Cesium
// ion imagery/terrain can only be accessed from the browser, so the token must
// live in the client bundle (standard Cesium practice).
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6Ikl4UEppUGx0RGtTRUhWMVAiLCJqdGkiOiI0NmZjMGFlNC0xZDY4LTQ4YjQtODQwYS1jZjc2YWI5M2QyZWMiLCJpZCI6NTEzNjYzLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3OTA5NTI1OTF9.TZRqEr5GanZ8K9-qu8fzz_uEn0yhBJvCp_ubGitDRDc";

export default Cesium;