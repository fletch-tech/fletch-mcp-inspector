import packageJson from "../../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Fletch MCP Studio",
  version: packageJson.version,
  copyright: `© ${currentYear}, Fletch.`,
  meta: {
    title: "Fletch MCP Studio",
    description:
      "Fletch MCP Studio is a testing and debugging tool for MCP servers.",
  },
};
