#!/usr/bin/env node

/**
 * Download source files from Vercel deployment.
 *
 * Run with no arguments for interactive setup, or configure via CLI/env/.env.
 *
 * Usage:
 *   npx vercel-deploy-source-downloader [token] [options]
 *
 * Options:
 *   --deployment <id>    Deployment ID, with or without dpl_ prefix (default: latest)
 *   --project <name>     Project name (default: auto-detect from deployment)
 *   --team <slug|id>     Team slug or ID (default: auto-detect from deployment)
 *   --output <path>      Output directory path (default: ./out)
 *   --verbose            Show detailed progress for each file
 *   --retry-failed       Re-download only files that failed in a previous run
 *
 * Get your token from: https://vercel.com/account/tokens
 * Find deployment ID from: https://vercel.com/{scope}/{project}/{id}/source
 */

import {
  writeFileSync,
  mkdirSync,
  statSync,
  existsSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import https from "https";
import { createInterface } from "readline";

const promptUser = (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

interface FileNode {
  name: string;
  type: "file" | "directory" | "lambda";
  link?: string;
  children?: FileNode[];
}

interface Deployment {
  uid: string;
  name: string;
  url: string;
  created: number;
  state: string;
}

interface DeploymentsResponse {
  deployments: Deployment[];
}

interface TreeStructure {
  [key: string]: TreeStructure | null;
}

/**
 * Loads environment variables from .env file if it exists.
 */
const loadEnvFile = () => {
  const envPath = join(process.cwd(), ".env");

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");

    lines.forEach((line) => {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
};

/**
 * Parses command line arguments.
 */
const parseArgs = () => {
  // Load .env file first
  loadEnvFile();

  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  let token = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        options[key] = value;
        i++; // Skip next arg
      } else {
        options[key] = "true";
      }
    } else if (!token && !arg.includes(".ts")) {
      token = arg;
    }
  }

  const resolvedDeployment = options.deployment || process.env.VERCEL_DEPLOYMENT || "";
  const deploymentExplicitlySet = !!resolvedDeployment;

  // Priority: CLI args > environment variables > defaults
  return {
    token: token || process.env.VERCEL_TOKEN || "",
    deployment: resolvedDeployment || "latest",
    deploymentExplicitlySet,
    project: options.project || process.env.VERCEL_PROJECT || "",
    team: options.team || process.env.VERCEL_TEAM || "",
    output: options.output || process.env.VERCEL_OUTPUT || "./out",
    verbose: options.verbose === "true",
    retryFailed: options["retry-failed"] === "true",
  };
};

/**
 * Makes an HTTPS request and returns parsed JSON.
 */
const makeRequest = async <T>(url: string, token: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${data}. Error: ${e}`));
            }
          });
        }
      )
      .on("error", reject);
  });
};

/**
 * Gets the latest deployment for a project.
 */
const getLatestDeployment = async (
  token: string,
  projectName?: string,
  teamId?: string
): Promise<{
  deploymentId: string;
  deploymentUrl: string;
  projectName: string;
  teamId: string;
}> => {
  // If project name is provided, fetch deployments for that project
  let deploymentsUrl = "https://api.vercel.com/v6/deployments?limit=100";
  if (teamId) {
    deploymentsUrl += `&teamId=${teamId}`;
  }

  const response = await makeRequest<DeploymentsResponse>(deploymentsUrl, token);

  if (!response.deployments || response.deployments.length === 0) {
    throw new Error("No deployments found");
  }

  // Filter by project name if provided
  let deployments = response.deployments;
  if (projectName) {
    deployments = deployments.filter((d) => d.name === projectName);
    if (deployments.length === 0) {
      throw new Error(`No deployments found for project: ${projectName}`);
    }
  }

  // Filter by state (only Ready deployments)
  deployments = deployments.filter((d) => d.state === "READY");

  if (deployments.length === 0) {
    throw new Error("No ready deployments found");
  }

  // Sort by creation time (newest first)
  deployments.sort((a, b) => b.created - a.created);

  const latest = deployments[0];

  return {
    deploymentId: latest.uid,
    deploymentUrl: latest.url,
    projectName: latest.name,
    teamId: teamId || "",
  };
};

/**
 * Downloads all source files from Vercel deployment.
 */
const downloadSource = async () => {
  const downloadedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const failedFiles: string[] = [];

  const args = parseArgs();

  // Setup logging — log file path is set once we know the output directory
  let logFile = "";
  const logBuffer: string[] = [];
  const isVerbose = args.verbose;

  const initLogFile = (dir: string, fresh = false) => {
    logFile = join(dir, "download-log.txt");
    if (fresh || !existsSync(logFile)) {
      writeFileSync(logFile, logBuffer.join("\n") + (logBuffer.length ? "\n" : ""));
    } else {
      const separator = `\n${"─".repeat(60)}\n📅 New run: ${new Date().toISOString()}\n${"─".repeat(60)}\n`;
      appendFileSync(logFile, separator + logBuffer.join("\n") + (logBuffer.length ? "\n" : ""));
    }
  };

  const log = (message: string, alwaysShow = false) => {
    if (logFile) {
      appendFileSync(logFile, message + "\n");
    } else {
      logBuffer.push(message);
    }
    if (isVerbose || alwaysShow) {
      console.log(message);
    }
  };

  const logError = (message: string) => {
    if (logFile) {
      appendFileSync(logFile, message + "\n");
    } else {
      logBuffer.push(message);
    }
    console.error(message);
  };

  /**
   * Generates a tree structure from file paths.
   */
  const generateTree = (filePaths: string[], baseDir: string): string[] => {
    const tree: string[] = [];
    const structure: TreeStructure = {};

    // Build tree structure
    filePaths.forEach((filePath) => {
      const relativePath = filePath.replace(baseDir + "/", "");
      const parts = relativePath.split("/");
      let current: TreeStructure = structure;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file
          current[part] = null;
        } else {
          // It's a directory
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      });
    });

    // Convert structure to tree lines
    const buildTreeLines = (obj: TreeStructure, prefix = "", _isLast = true) => {
      const entries = Object.entries(obj).sort(([a], [b]) => {
        // Directories first, then files
        const aIsDir = obj[a] !== null;
        const bIsDir = obj[b] !== null;
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

      entries.forEach(([key, value], index) => {
        const isLastEntry = index === entries.length - 1;
        const connector = isLastEntry ? "└── " : "├── ";
        const icon = value === null ? "📄 " : "📁 ";

        tree.push(prefix + connector + icon + key);

        if (value !== null) {
          const extension = isLastEntry ? "    " : "│   ";
          buildTreeLines(value, prefix + extension, isLastEntry);
        }
      });
    };

    buildTreeLines(structure);
    return tree;
  };

  let spinnerInterval: ReturnType<typeof setInterval> | null = null;

  try {
    // Interactive mode when deployment ID is not explicitly provided
    if (!args.deploymentExplicitlySet) {
      console.log("🚀 Vercel Deploy Source Downloader — Interactive Setup\n");

      // Step 1: Token — show pre-filled if found in env
      console.log("Step 1: Vercel API Token");
      console.log("   Create or find your token at: https://vercel.com/account/tokens\n");
      if (args.token) {
        const masked = args.token.slice(0, 6) + "..." + args.token.slice(-4);
        console.log(`   Found token in environment: ${masked}\n`);
        const tokenInput = await promptUser("   Vercel token (Enter to use above): ");
        if (tokenInput) args.token = tokenInput;
      } else {
        args.token = await promptUser("   Vercel token: ");
      }

      if (!args.token) {
        logError("❌ Token is required. Get one from https://vercel.com/account/tokens");
        process.exit(1);
      }

      // Step 2: Deployment ID — required
      console.log("\nStep 2: Deployment ID");
      console.log("   Copy the ID from your Vercel dashboard URL:");
      console.log("   https://vercel.com/{scope}/{project}/{THIS_PART}/source");
      console.log("   Works with or without the dpl_ prefix.\n");
      const deploymentInput = await promptUser("   Deployment ID (Enter for latest): ");
      args.deployment = deploymentInput || "latest";

      // Step 3: Project & Team — optional
      console.log("\nStep 3: Project & Team (optional — auto-detected from deployment ID)");
      console.log("   These are auto-detected. Press Enter to skip.\n");
      const projectInput = await promptUser("   Project name (Enter to skip): ");
      args.project = projectInput || "";

      console.log("   Accepts a slug (e.g. numanaral) or ID (e.g. team_xxx).\n");
      const teamInput = await promptUser("   Team (Enter to skip): ");
      args.team = teamInput || "";

      console.log("");
    }

    log("🔑 Got authentication token", true);
    log("", true);

    let deploymentId: string;
    let deploymentUrl: string;
    let projectName: string;
    let teamId: string;

    // Parse Vercel dashboard URLs like:
    // https://vercel.com/{scope}/{project}/{buildId}/source
    const parseDashboardUrl = (input: string) => {
      const match = input.match(/vercel\.com\/([^/]+)\/([^/]+)\/([a-zA-Z0-9]+)/);
      if (match) {
        return { scope: match[1], project: match[2], buildId: match[3] };
      }
      return null;
    };

    // Resolve team ID from slug by querying the teams API
    const resolveTeams = async () => {
      const teamsResponse = await makeRequest<Record<string, unknown>>(
        "https://api.vercel.com/v2/teams",
        args.token
      );
      return (teamsResponse.teams || []) as Array<{
        id: string;
        slug: string;
        name: string;
      }>;
    };

    // Interactive team selection
    const selectTeam = async (
      teams: Array<{ id: string; slug: string; name: string }>
    ): Promise<{ id: string; slug: string; name: string } | null> => {
      if (teams.length === 0) return null;

      console.log("\n🏢 Available teams:");
      console.log("   0) Personal account (no team)");
      teams.forEach((team, i) => {
        console.log(`   ${i + 1}) ${team.name} (${team.slug})`);
      });

      const answer = await promptUser("\nSelect a team [0-" + teams.length + "]: ");
      const index = parseInt(answer, 10);

      if (isNaN(index) || index < 0 || index > teams.length) {
        console.log("Invalid selection, using personal account.");
        return null;
      }

      if (index === 0) return null;
      return teams[index - 1];
    };

    // Get deployment info
    if (args.deployment === "latest") {
      log("🔍 Fetching latest deployment...", true);
      deploymentId = "";
      deploymentUrl = "";
      projectName = "";
      teamId = "";

      if (args.team) {
        const info = await getLatestDeployment(args.token, args.project, args.team);
        deploymentId = info.deploymentId;
        deploymentUrl = info.deploymentUrl;
        projectName = info.projectName;
        teamId = args.team;
        log(`✅ Found latest deployment`, true);
      } else {
        let found = false;

        // Try personal account first
        try {
          const info = await getLatestDeployment(args.token, args.project);
          deploymentId = info.deploymentId;
          deploymentUrl = info.deploymentUrl;
          projectName = info.projectName;
          found = true;
          log(`✅ Found latest deployment (personal account)`, true);
        } catch {
          // Try each team automatically
          log(`   Not found in personal account, checking teams...`, true);
          const teams = await resolveTeams();

          for (const team of teams) {
            try {
              const info = await getLatestDeployment(args.token, args.project, team.id);
              deploymentId = info.deploymentId;
              deploymentUrl = info.deploymentUrl;
              projectName = info.projectName;
              teamId = team.id;
              found = true;
              log(`✅ Found latest deployment in team: ${team.name}`, true);
              break;
            } catch {
              continue;
            }
          }

          if (!found) {
            log(`   Auto-detection failed. Let's pick a team manually.`, true);
            const selected = await selectTeam(teams);
            const selectedId = selected?.id || "";
            const info = await getLatestDeployment(args.token, args.project, selectedId);
            deploymentId = info.deploymentId;
            deploymentUrl = info.deploymentUrl;
            projectName = info.projectName;
            teamId = selectedId;
            log(`✅ Found latest deployment`, true);
          }
        }
      }
    } else {
      // Check if the input is a Vercel dashboard URL
      const dashboardInfo = parseDashboardUrl(args.deployment);
      let buildId: string;
      let parsedProject = args.project;
      let parsedScope = "";

      if (dashboardInfo) {
        buildId = dashboardInfo.buildId;
        parsedProject = parsedProject || dashboardInfo.project;
        parsedScope = dashboardInfo.scope;
        log(
          `🔍 Parsed Vercel URL — project: ${parsedProject}, scope: ${parsedScope}, build: ${buildId}`,
          true
        );
      } else {
        buildId = args.deployment;
        log(`🔍 Fetching deployment info for: ${buildId}`, true);
      }

      deploymentId = buildId;

      // IDs to try: the raw input, and with dpl_ prefix if not already present
      const idsToTry = [buildId];
      if (!buildId.startsWith("dpl_")) {
        idsToTry.push(`dpl_${buildId}`);
      }

      const fetchDeployment = async (id: string, tId?: string) => {
        let url = `https://api.vercel.com/v13/deployments/${id}`;
        if (tId) url += `?teamId=${tId}`;
        return makeRequest<Record<string, unknown>>(url, args.token);
      };

      let deploymentInfo: Record<string, unknown> | null = null;
      let found = false;
      teamId = args.team || "";

      // Build the list of team scopes to try
      const teamScopes: Array<{ id: string; label: string }> = [];

      if (args.team) {
        teamScopes.push({ id: args.team, label: `team ${args.team}` });
      } else {
        teamScopes.push({ id: "", label: "personal account" });

        log(`   Resolving teams...`, true);
        const teams = await resolveTeams();

        // If we have a scope from the URL, prioritize that team
        if (parsedScope) {
          const scopeTeam = teams.find((t) => t.slug === parsedScope);
          if (scopeTeam) {
            teamScopes.push({ id: scopeTeam.id, label: `${scopeTeam.name} (${scopeTeam.slug})` });
          }
          for (const t of teams) {
            if (t.slug !== parsedScope) {
              teamScopes.push({ id: t.id, label: `${t.name} (${t.slug})` });
            }
          }
        } else {
          for (const t of teams) {
            teamScopes.push({ id: t.id, label: `${t.name} (${t.slug})` });
          }
        }
      }

      // Try every combination of ID format x team scope via v13 API
      for (const scope of teamScopes) {
        if (found) break;
        for (const id of idsToTry) {
          log(`   Trying ${id} in ${scope.label}...`, true);
          const result = await fetchDeployment(id, scope.id || undefined);
          if (!result.error) {
            deploymentInfo = result;
            deploymentId = id;
            teamId = scope.id;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        throw new Error(
          `Deployment "${buildId}" not found. ` +
            `Tried ${idsToTry.length} ID format(s) across ${teamScopes.length} scope(s). ` +
            `Verify the deployment ID is correct and that your token has access.`
        );
      }

      deploymentUrl = (deploymentInfo!.url as string) || "";
      projectName = (deploymentInfo!.name as string) || "";

      if (!deploymentUrl) {
        throw new Error(
          `Deployment API returned no URL. Response: ${JSON.stringify(deploymentInfo)}`
        );
      }

      log(`✅ Got deployment info`, true);
    }

    log("", true);
    log(`📦 Deployment ID:  ${deploymentId}`, true);
    log(`🌐 Deployment URL: ${deploymentUrl}`, true);
    log(`📁 Project:        ${projectName}`, true);
    if (teamId) {
      log(`👥 Team:           ${teamId}`, true);
    }
    log("", true);

    const token = args.token;

    // Get file tree from API (using base=src for source code)
    log("📋 Fetching file tree from API...", true);
    log("", true);

    let treeUrl = `https://vercel.com/api/file-tree/${deploymentUrl}?base=src`;
    if (teamId) {
      treeUrl += `&teamId=${teamId}`;
    }

    const fileTreeResponse = await makeRequest<FileNode[] | Record<string, unknown>>(
      treeUrl,
      token
    );

    if (!Array.isArray(fileTreeResponse)) {
      throw new Error(
        `File tree API did not return an array. Response: ${JSON.stringify(fileTreeResponse)}`
      );
    }

    const fileTree: FileNode[] = fileTreeResponse;

    // Multi-line spinner + counters for non-verbose progress display
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let spinnerIdx = 0;
    let downloadCount = 0;
    let skipCount = 0;
    let failCount = 0;
    const SPINNER_LINES = 4;

    const renderSpinner = () => {
      const frame = spinnerFrames[spinnerIdx % spinnerFrames.length];
      spinnerIdx++;
      const lines = [
        `   ${frame} Downloading...`,
        `   ✅ Downloaded: ${downloadCount}`,
        // Extra space after ⏭️ — it renders narrower than ✅/❌ in terminals
        `   ⏭️  Skipped:    ${skipCount}`,
        `   ❌ Failed:     ${failCount}`,
      ];
      // Move cursor up to overwrite previous render, then write all lines
      if (spinnerIdx > 1) {
        process.stdout.write(`\x1b[${SPINNER_LINES}A`);
      }
      process.stdout.write(lines.map((l) => `\r${l}\x1b[K`).join("\n") + "\n");
    };

    const isTTY = process.stdout.isTTY;

    const startSpinner = () => {
      if (!isVerbose && isTTY && !spinnerInterval) {
        renderSpinner();
        spinnerInterval = setInterval(renderSpinner, 100);
      }
    };

    const stopSpinner = () => {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
        // Clear the spinner lines
        process.stdout.write(`\x1b[${SPINNER_LINES}A`);
        for (let i = 0; i < SPINNER_LINES; i++) {
          process.stdout.write(`\r\x1b[K\n`);
        }
        process.stdout.write(`\x1b[${SPINNER_LINES}A`);
      }
    };

    log(`✅ Got file tree (${fileTree.length} top-level entries)`, true);
    log("", true);

    // Resolve the download URL from a file tree link.
    // Two known formats:
    //   1. Hash-based: ".../files/abc123def" -> construct full URL
    //   2. Path-based: ".../files/get?path=..." -> use as-is (already a full URL)
    const resolveFileUrl = (link: string): string | null => {
      const hashMatch = link.match(/\/files\/([a-f0-9]+)$/);
      if (hashMatch) {
        let url = `https://vercel.com/api/v7/deployments/${deploymentId}/files/${hashMatch[1]}`;
        if (teamId) url += `?teamId=${teamId}`;
        return url;
      }

      if (link.startsWith("http")) {
        const url = new URL(link);
        if (teamId && !url.searchParams.has("teamId")) {
          url.searchParams.set("teamId", teamId);
        }
        return url.toString();
      }

      if (link.startsWith("/")) {
        const url = new URL(link, "https://vercel.com");
        if (teamId && !url.searchParams.has("teamId")) {
          url.searchParams.set("teamId", teamId);
        }
        return url.toString();
      }

      return null;
    };

    // Download a file given its resolved URL
    const downloadFile = async (fileUrl: string): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        https
          .get(
            fileUrl,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  const json = JSON.parse(data);
                  if (json.error) {
                    reject(new Error(json.error.message || JSON.stringify(json.error)));
                    return;
                  }
                  if (!json.data) {
                    reject(
                      new Error(`Unexpected API response (no data field): ${data.slice(0, 200)}`)
                    );
                    return;
                  }
                  resolve(Buffer.from(json.data, "base64"));
                } catch (e) {
                  reject(e);
                }
              });
            }
          )
          .on("error", reject);
      });
    };

    // Helper function to get directory tree
    const getDirectoryTree = async (dirName: string): Promise<FileNode[]> => {
      return new Promise((resolve, reject) => {
        let dirUrl = `https://vercel.com/api/file-tree/${deploymentUrl}?base=src/${dirName}`;
        if (teamId) {
          dirUrl += `&teamId=${teamId}`;
        }

        https
          .get(
            dirUrl,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(e);
                }
              });
            }
          )
          .on("error", reject);
      });
    };

    // Recursive function to process file tree
    const processNode = async (
      node: FileNode,
      basePath: string = "",
      relativePath: string = ""
    ): Promise<void> => {
      const fullPath = join(basePath, node.name);
      const relativeFilePath = relativePath ? `${relativePath}/${node.name}` : node.name;

      if (node.type === "directory") {
        // In retry mode, skip directories that can't contain any failed files
        if (retryOnlyPaths) {
          const dirPrefix = relativeFilePath + "/";
          const hasRelevantFile = [...retryOnlyPaths].some((p) => p.startsWith(dirPrefix));
          if (!hasRelevantFile) return;
        }

        // Create directory
        mkdirSync(fullPath, { recursive: true });

        // Get directory contents if not already loaded
        let children = node.children;
        if (!children) {
          try {
            children = await getDirectoryTree(relativeFilePath);
            node.children = children;
          } catch (error) {
            logError(`❌ Failed to get directory tree for ${relativeFilePath}: ${error}`);
            return;
          }
        }

        if (children && !Array.isArray(children)) {
          logError(
            `❌ Unexpected directory tree response for ${relativeFilePath}: ${JSON.stringify(children)}`
          );
          return;
        }

        if (children && Array.isArray(children)) {
          for (const child of children) {
            await processNode(child, fullPath, relativeFilePath);
          }
        }
      } else if (node.type === "file" && node.link) {
        // In retry mode, skip files not in the failed set
        if (retryOnlyPaths && !retryOnlyPaths.has(relativeFilePath)) {
          return;
        }

        // Download and save file
        try {
          const fileUrl = resolveFileUrl(node.link);
          if (!fileUrl) {
            logError(`❌ Could not resolve download URL from link: ${node.link}`);
            return;
          }

          // Check if file already exists (skip in retry mode — always re-download)
          if (!retryOnlyPaths && existsSync(fullPath)) {
            const stats = statSync(fullPath);
            if (stats.size > 0) {
              log(`⏭️  Skipping (already exists): ${fullPath}`);
              skippedFiles.push(fullPath);
              skipCount++;
              return;
            }
          }

          const content = await downloadFile(fileUrl);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content);
          downloadedFiles.push(fullPath);
          downloadCount++;
          log(`✅ Downloaded: ${fullPath}`);
        } catch (error) {
          failCount++;
          failedFiles.push(fullPath);
          logError(`❌ Failed to download ${fullPath}: ${error}`);
        }
      } else if (node.type === "lambda") {
        // Skip lambda files (serverless functions)
        log(`⏭️  Skipping lambda: ${fullPath}`);
      }
    };

    // Create output directory: out/{deploymentId}/source/
    const baseOutput = args.output.startsWith("/") ? args.output : join(process.cwd(), args.output);
    const deployDir = join(baseOutput, deploymentId);
    const outputDir = join(deployDir, "source");
    mkdirSync(outputDir, { recursive: true });

    // Parse previous log for failed paths (must happen before initLogFile overwrites it)
    const parsePreviousFailures = (): Set<string> => {
      const prevLog = join(deployDir, "download-log.txt");
      if (!existsSync(prevLog)) return new Set();
      const logContent = readFileSync(prevLog, "utf-8");
      const failedPattern = /❌ Failed to download .*\/source\/(.+?):/g;
      const paths = new Set<string>();
      let match;
      while ((match = failedPattern.exec(logContent)) !== null) {
        paths.add(match[1]);
      }
      return paths;
    };
    const previousFailures = parsePreviousFailures();

    let retryOnlyPaths: Set<string> | null = null;
    let freshLog = false;

    if (args.retryFailed) {
      // --retry-failed flag: only re-download previously failed files
      if (previousFailures.size === 0) {
        console.log("✅ No failed downloads found in previous log. Nothing to retry!");
        process.exit(0);
      }
      retryOnlyPaths = previousFailures;
    } else if (downloadedFiles.length === 0 && skippedFiles.length === 0) {
      // Check if a previous download exists
      const existingFiles = existsSync(outputDir) && readdirSync(outputDir).length > 0;
      if (existingFiles) {
        const countExisting = (dir: string): number => {
          let count = 0;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) count += countExisting(join(dir, entry.name));
            else count++;
          }
          return count;
        };
        const existingCount = countExisting(outputDir);

        console.log("📂 Previous download detected for this deployment.");
        console.log(`   ${existingCount} file(s) already downloaded.`);
        if (previousFailures.size > 0) {
          console.log(`   ${previousFailures.size} file(s) failed in previous run.`);
        }
        console.log("");

        if (previousFailures.size > 0) {
          console.log("   Y = resume (skip existing, download remaining)");
          console.log("   n = re-download everything from scratch");
          console.log("   r = retry failed only");
          console.log("");
          const choice = await promptUser("   Choice (Y/n/r): ");
          if (choice.toLowerCase() === "n") {
            freshLog = true;
            rmSync(outputDir, { recursive: true, force: true });
            mkdirSync(outputDir, { recursive: true });
          } else if (choice.toLowerCase() === "r") {
            retryOnlyPaths = previousFailures;
          } else {
            // resume — append to log
          }
        } else {
          console.log(
            "   Enter to continue where you left off, or 'n' to re-download from scratch.\n"
          );
          const choice = await promptUser("   Continue? (Y/n): ");
          if (choice.toLowerCase() === "n") {
            freshLog = true;
            rmSync(outputDir, { recursive: true, force: true });
            mkdirSync(outputDir, { recursive: true });
          }
        }
      } else {
        freshLog = true;
      }
    }

    initLogFile(deployDir, freshLog);
    log(`📁 Output directory: ${outputDir}`, true);
    log("", true);

    if (freshLog) {
      log("🗑️  Clearing previous download...\n", true);
    } else if (retryOnlyPaths) {
      log(`🔄 Retrying ${retryOnlyPaths.size} previously failed file(s)...\n`, true);
    }

    log("⬇️  Downloading files...", true);
    if (!isVerbose) {
      log("   (Use --verbose to see detailed progress)", true);
    }
    log("", true);

    startSpinner();

    // Process all top-level nodes
    for (const node of fileTree) {
      await processNode(node, outputDir);
    }

    stopSpinner();

    log("\n🎉 All files processed successfully!\n", true);

    // Run comparison
    log("📊 Running comparison...\n", true);

    // Calculate statistics for downloaded files
    const extensions: Record<string, number> = {};
    let totalSize = 0;

    const allFiles = [...downloadedFiles, ...skippedFiles];

    allFiles.forEach((file) => {
      const stats = statSync(file);
      totalSize += stats.size;

      const ext = file.split(".").pop() || "no-extension";
      extensions[ext] = (extensions[ext] || 0) + 1;
    });

    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    log(`📁 Total files: ${allFiles.length}`, true);
    log(`   ✅ Downloaded: ${downloadedFiles.length}`, true);
    // Extra space after ⏭️ — it renders narrower than ✅/❌ in terminals
    log(`   ⏭️  Skipped: ${skippedFiles.length}`, true);
    log(`   ❌ Failed: ${failedFiles.length}`, true);
    log(`💾 Total size: ${totalSizeMB} MB\n`, true);

    log("📈 File types breakdown:", true);
    Object.entries(extensions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([ext, count]) => {
        log(`   ${ext.padEnd(15)} ${count.toString().padStart(4)} files`, true);
      });

    // Generate tree structure — always in log, console only in verbose
    log("\n🌳 File structure tree:");
    log("");
    const treeLines = generateTree(allFiles, outputDir);
    treeLines.forEach((line) => log(line));

    // Skipped files — always in log, console only in verbose
    if (skippedFiles.length > 0) {
      log(`\n⏭️ Skipped files (already existed): ${skippedFiles.length}`);
      skippedFiles.forEach((file) => {
        log(`   ${file.replace(outputDir + "/", "")}`);
      });
    }

    // Failed files — always show in console since they're actionable
    if (failedFiles.length > 0) {
      log(`\n❌ Failed downloads: ${failedFiles.length}`, true);
      failedFiles.forEach((file) => {
        log(`   ${file.replace(outputDir + "/", "")}`, true);
      });

      // Interactive retry prompt
      const retryAnswer = await promptUser(
        `\n   ${failedFiles.length} file(s) failed. Retry now? (Y/n): `
      );
      if (retryAnswer.toLowerCase() !== "n") {
        log("\n🔄 Retrying failed downloads...\n", true);
        const stillFailed: string[] = [];
        for (const filePath of failedFiles) {
          const relPath = filePath.replace(outputDir + "/", "");
          // Walk the tree to find the matching node's link
          const findLink = (nodes: FileNode[], parentRel: string): string | null => {
            for (const n of nodes) {
              const rel = parentRel ? `${parentRel}/${n.name}` : n.name;
              if (n.type === "file" && rel === relPath && n.link) {
                return n.link;
              }
              if (n.children) {
                const found = findLink(n.children, rel);
                if (found) return found;
              }
            }
            return null;
          };
          const link = findLink(fileTree, "");
          if (!link) {
            log(`   ⏭️ Could not find tree entry for: ${relPath}`, true);
            stillFailed.push(filePath);
            continue;
          }
          const fileUrl = resolveFileUrl(link);
          if (!fileUrl) {
            log(`   ❌ Could not resolve URL for: ${relPath}`, true);
            stillFailed.push(filePath);
            continue;
          }
          try {
            const content = await downloadFile(fileUrl);
            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, content);
            downloadedFiles.push(filePath);
            downloadCount++;
            log(`   ✅ Downloaded: ${relPath}`, true);
          } catch (error) {
            stillFailed.push(filePath);
            log(`   ❌ Still failed: ${relPath}: ${error}`, true);
          }
        }

        // Update failedFiles to only those that still failed
        failedFiles.length = 0;
        failedFiles.push(...stillFailed);

        if (failedFiles.length === 0) {
          log("\n✅ All previously failed files downloaded successfully!", true);
        } else {
          log(`\n❌ ${failedFiles.length} file(s) still failed.`, true);
        }
      }

      // Print retry command for later use if there are still failures
      if (failedFiles.length > 0) {
        const deployArg = deploymentId.startsWith("dpl_") ? deploymentId.slice(4) : deploymentId;
        log(
          `\n   To retry later: npx tsx src/vercel-deploy-source-downloader.ts --deployment ${deployArg} --retry-failed`,
          true
        );
      }
    }

    log("\n✨ Download and verification complete!", true);
    log(`📄 Full log saved to: ${logFile}`, true);
    if (!isVerbose) {
      log("   (Use --verbose to see file tree and skipped files)\n", true);
    }
  } catch (error) {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
      if (process.stdout.isTTY) {
        process.stdout.write(`\x1b[4A`);
        for (let i = 0; i < 4; i++) process.stdout.write(`\r\x1b[K\n`);
        process.stdout.write(`\x1b[4A`);
      }
    }
    logError(`❌ Failed to download source: ${error}`);
    process.exit(1);
  }
};

downloadSource();
