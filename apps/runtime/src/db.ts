import { sqlite } from "@flue/runtime/node";

export default sqlite(process.env.AMBIENT_DATABASE_PATH ?? "./data/tenant.sqlite");
