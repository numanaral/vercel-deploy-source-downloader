#!/usr/bin/env node

/**
 * Download source files from Vercel deployment.
 *
 * Usage:
 *   npx vercel-deploy-source-downloader [token] [options]
 *
 * Options:
 *   --deployment <id|latest>    Deployment ID or "latest" (default: latest)
 *   --project <n>            Project name (default: auto-detect)
 *   --team <id>                 Team ID (default: auto-detect)
 *   --output <path>             Output directory path (default: ./out)
 *   --verbose                   Show detailed progress for each file
 *
 * Environment Variables (or use .env file):
 *   VERCEL_TOKEN          Your Vercel API token (required)
 *   VERCEL_DEPLOYMENT     Deployment ID or "latest" (default: latest)
 *   VERCEL_PROJECT        Project name (optional)
 *   VERCEL_TEAM           Team ID (optional)
 *   VERCEL_OUTPUT         Output directory path (optional, default: ./out)
 *
 * Examples:
 *   # Using command line
 *   npx vercel-deploy-source-downloader <token>
 *   npx vercel-deploy-source-downloader <token> --deployment dpl_ABC123
 *   npx vercel-deploy-source-downloader <token> --project my-project --verbose
 *
 *   # Using environment variables
 *   VERCEL_TOKEN=<token> npx vercel-deploy-source-downloader
 *   VERCEL_TOKEN=<token> VERCEL_PROJECT=my-project npx vercel-deploy-source-downloader
 *
 *   # Using .env file
 *   # Create .env file with:
 *   # VERCEL_TOKEN=your_token_here
 *   # VERCEL_PROJECT=my-project
 *   # VERCEL_DEPLOYMENT=latest
 *   npx vercel-deploy-source-downloader
 *
 * Get your token from: https://vercel.com/account/tokens
 */

import { writeFileSync, mkdirSync, statSync, existsSync, appendFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import https from "https";

interface FileNode {
  name: string;
  type: "file" | "directory" | "lambda";
  link?: string;
  children?: FileNode[];
}

interface FileResponse {
  data: string; // base64 encoded content
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

interface DeploymentInfo {
  uid: string;
  name: string;
  url: string;
  created: number;
  state: string;
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

  // Priority: CLI args > environment variables > defaults
  return {
    token: token || process.env.VERCEL_TOKEN || "",
    deployment: options.deployment || process.env.VERCEL_DEPLOYMENT || "latest",
    project: options.project || process.env.VERCEL_PROJECT || "",
    team: options.team || process.env.VERCEL_TEAM || "",
    output: options.output || process.env.VERCEL_OUTPUT || "./out",
    verbose: options.verbose === "true",
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

  const args = parseArgs();

  // Setup logging
  const logFile = join(process.cwd(), "download-log.txt");
  const isVerbose = args.verbose;

  // Clear previous log file
  writeFileSync(logFile, "");

  const log = (message: string, alwaysShow = false) => {
    // Always write to file
    appendFileSync(logFile, message + "\n");
    // Only show in console if verbose or alwaysShow
    if (isVerbose || alwaysShow) {
      console.log(message);
    }
  };

  const logError = (message: string) => {
    appendFileSync(logFile, message + "\n");
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

  try {
    // Validate token
    if (!args.token) {
      logError("❌ VERCEL_TOKEN not provided");
      logError("\nUsage:");
      logError("  npx vercel-deploy-source-downloader [token] [options]");
      logError("\nOptions:");
      logError("  --deployment <id|latest>    Deployment ID or 'latest' (default: latest)");
      logError("  --project <n>            Project name (default: auto-detect)");
      logError("  --team <id>                 Team ID (default: auto-detect)");
      logError("  --output <path>             Output directory path (default: ./out)");
      logError("  --verbose                   Show detailed progress");
      logError("\nEnvironment Variables (or use .env file):");
      logError("  VERCEL_TOKEN          Your Vercel API token (required)");
      logError("  VERCEL_DEPLOYMENT     Deployment ID or 'latest' (default: latest)");
      logError("  VERCEL_PROJECT        Project name (optional)");
      logError("  VERCEL_TEAM           Team ID (optional)");
      logError("  VERCEL_OUTPUT         Output directory path (optional, default: ./out)");
      logError("\nExamples:");
      logError("  # Using command line");
      logError("  npx vercel-deploy-source-downloader <token>");
      logError("  npx vercel-deploy-source-downloader <token> --deployment dpl_ABC123");
      logError("\n  # Using .env file (create .env with VERCEL_TOKEN=your_token)");
      logError("  npx vercel-deploy-source-downloader");
      logError("\nGet your token from: https://vercel.com/account/tokens");
      process.exit(1);
    }

    log("🔑 Got authentication token", true);
    log("", true);

    let deploymentId: string;
    let deploymentUrl: string;
    let projectName: string;
    let teamId: string;

    // Get deployment info
    if (args.deployment === "latest") {
      log("🔍 Fetching latest deployment...", true);
      const info = await getLatestDeployment(args.token, args.project, args.team);
      deploymentId = info.deploymentId;
      deploymentUrl = info.deploymentUrl;
      projectName = info.projectName;
      teamId = info.teamId;
      log(`✅ Found latest deployment`, true);
    } else {
      deploymentId = args.deployment;
      // Need to fetch deployment info to get URL
      log(`🔍 Fetching deployment info for: ${deploymentId}`, true);

      let inspectUrl = `https://api.vercel.com/v13/deployments/${deploymentId}`;
      if (args.team) {
        inspectUrl += `?teamId=${args.team}`;
      }

      const deploymentInfo: DeploymentInfo = await makeRequest(inspectUrl, args.token);
      deploymentUrl = deploymentInfo.url;
      projectName = deploymentInfo.name;
      teamId = args.team || "";
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

    const fileTree = await makeRequest<FileNode[]>(treeUrl, token);

    log(`✅ Got file tree`, true);
    log("", true);

    /**
     * Extracts a content-addressed file hash from a link of the form:
     *   /files/<hex_hash>
     * Returns null if the link uses the path-based format instead.
     */
    const getFileHash = (link: string): string | null => {
      const match = link.match(/\/files\/([a-f0-9]+)(?:\?|$)/);
      return match ? match[1] : null;
    };

    /**
     * Extracts the file path from a path-based link of the form:
     *   /files/get?path=<encoded_path>
     * Returns null if the link uses the hash-based format instead.
     */
    const getFilePath = (link: string): string | null => {
      const match = link.match(/[?&]path=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    };

    /**
     * Downloads a file using its content-addressed hash.
     * Endpoint: GET /api/v7/deployments/:id/files/:hash
     * The response is a JSON object with a base64-encoded `data` field.
     */
    const downloadFileByHash = async (fileHash: string): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        let fileUrl = `https://vercel.com/api/v7/deployments/${deploymentId}/files/${fileHash}`;
        if (teamId) {
          fileUrl += `?teamId=${teamId}`;
        }

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
                  const json: FileResponse = JSON.parse(data);
                  // Decode base64 data
                  const buffer = Buffer.from(json.data, "base64");
                  resolve(buffer);
                } catch (e) {
                  reject(e);
                }
              });
            }
          )
          .on("error", reject);
      });
    };

    /**
     * Downloads a file using its deployment-relative path.
     * Endpoint: GET /api/v7/deployments/:id/files/get?path=<encoded_path>
     * The response is the raw file content (not base64-wrapped JSON).
     */
    const downloadFileByPath = async (filePath: string): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        let fileUrl = `https://vercel.com/api/v7/deployments/${deploymentId}/files/get?path=${encodeURIComponent(filePath)}`;
        if (teamId) {
          fileUrl += `&teamId=${teamId}`;
        }

        https
          .get(
            fileUrl,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            (res) => {
              // This endpoint returns the same base64-wrapped JSON as the hash endpoint
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  const json: FileResponse = JSON.parse(data);
                  const buffer = Buffer.from(json.data, "base64");
                  resolve(buffer);
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
        // Create directory
        mkdirSync(fullPath, { recursive: true });

        // Get directory contents if not already loaded
        let children = node.children;
        if (!children) {
          try {
            children = await getDirectoryTree(relativeFilePath);
          } catch (error) {
            logError(`❌ Failed to get directory tree for ${relativeFilePath}: ${error}`);
            return;
          }
        }

        // Process children
        if (children && Array.isArray(children)) {
          for (const child of children) {
            await processNode(child, fullPath, relativeFilePath);
          }
        }
      } else if (node.type === "file" && node.link) {
        // Download and save file
        try {
          // The Vercel API returns two different link formats:
          //   1. Hash-based:  /files/<hex_hash>          — older/compiled assets
          //   2. Path-based:  /files/get?path=<filepath> — source files (Next.js pages, etc.)
          // We handle both so that neither format silently fails.
          const fileHash = getFileHash(node.link);
          const filePath = fileHash ? null : getFilePath(node.link);

          if (!fileHash && !filePath) {
            logError(`❌ Could not extract hash or path from link: ${node.link}`);
            return;
          }

          // Check if file already exists
          if (existsSync(fullPath)) {
            const stats = statSync(fullPath);
            if (stats.size > 0) {
              log(`⏭️  Skipping (already exists): ${fullPath}`);
              skippedFiles.push(fullPath);
              return;
            }
          }

          const content = fileHash
            ? await downloadFileByHash(fileHash)
            : await downloadFileByPath(filePath!);

          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content);
          downloadedFiles.push(fullPath);
          log(`✅ Downloaded: ${fullPath}`);
        } catch (error) {
          logError(`❌ Failed to download ${fullPath}: ${error}`);
        }
      } else if (node.type === "lambda") {
        // Skip lambda files (serverless functions)
        log(`⏭️  Skipping lambda: ${fullPath}`);
      }
    };

    log("⬇️  Downloading files...", true);
    if (!isVerbose) {
      log("   (Use --verbose to see detailed progress)", true);
    }
    log("", true);

    // Create output directory
    const outputDir = args.output.startsWith("/") ? args.output : join(process.cwd(), args.output);
    mkdirSync(outputDir, { recursive: true });
    log(`📁 Output directory: ${outputDir}`, true);
    log("", true);

    // Process all top-level nodes
    for (const node of fileTree) {
      await processNode(node, outputDir);
    }

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
    log(`   ⏭️  Skipped: ${skippedFiles.length}`, true);
    log(`💾 Total size: ${totalSizeMB} MB\n`, true);

    log("📈 File types breakdown:", true);
    Object.entries(extensions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([ext, count]) => {
        log(`   ${ext.padEnd(15)} ${count.toString().padStart(4)} files`, true);
      });

    // Check for important files
    log("\n🔍 Verifying important files:", true);
    const importantFiles = [
      "package.json",
      "next.config.ts",
      "tsconfig.json",
      "src/middleware.ts",
      "src/app/layout.tsx",
      "src/services/prisma/schema.prisma",
    ];

    importantFiles.forEach((file) => {
      const fullPath = join(outputDir, file);
      if (existsSync(fullPath)) {
        const stats = statSync(fullPath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        log(`   ✅ ${file.padEnd(40)} ${sizeKB.padStart(8)} KB`, true);
      } else {
        log(`   ❌ ${file} - NOT FOUND`, true);
      }
    });

    // Generate and display tree structure
    log("\n🌳 File structure tree:", true);
    log("", true);
    const treeLines = generateTree(allFiles, outputDir);
    treeLines.forEach((line) => log(line, true));

    log("\n✨ Download and verification complete!", true);
    log(`📄 Full log saved to: ${logFile}\n`, true);
  } catch (error) {
    logError(`❌ Failed to download source: ${error}`);
    process.exit(1);
  }
};

downloadSource();
