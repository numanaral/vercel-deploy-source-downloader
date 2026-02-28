import { execSync } from "child_process";

const BRANCH_PREFIX = "release";

type BumpType = "patch" | "minor" | "major";

const VALID_BUMP_TYPES = ["patch", "minor", "major"] as const;

const run = (command: string) => {
  console.log(`  $ ${command}`);
  return execSync(command, { encoding: "utf-8", stdio: "pipe" }).trim();
};

const runVisible = (command: string) => {
  console.log(`  $ ${command}`);
  execSync(command, { stdio: "inherit" });
};

const getCurrentVersion = () => {
  return run("node -p \"require('./package.json').version\"");
};

const ensureCleanWorkingTree = () => {
  const status = run("git status --porcelain");
  if (status) {
    console.error(
      "\n✗ Working tree is not clean. Commit or stash changes first.\n",
    );
    process.exit(1);
  }
};

const ensureOnMain = () => {
  const branch = run("git branch --show-current");
  if (branch !== "main") {
    console.error(`\n✗ Must be on main branch (currently on ${branch}).\n`);
    process.exit(1);
  }
  runVisible("git pull origin main");
};

const release = (bumpType: BumpType, dryRun: boolean) => {
  console.log(
    dryRun ? "\n🧪 Dry run — no push or PR.\n" : "\n🚀 Starting release...\n",
  );

  ensureCleanWorkingTree();
  ensureOnMain();

  const oldVersion = getCurrentVersion();
  console.log(`\n  Current version: ${oldVersion}`);

  run(`npm version ${bumpType} --no-git-tag-version`);

  const newVersion = getCurrentVersion();
  console.log(`  New version:     ${newVersion}\n`);

  const branchName = `${BRANCH_PREFIX}/release-v${newVersion}`;
  runVisible(`git checkout -b ${branchName}`);

  runVisible("git add package.json");
  runVisible(`git commit -m "release: v${newVersion}"`);

  runVisible(`git tag v${newVersion}`);

  if (dryRun) {
    console.log("\n✓ Dry run complete. To clean up:\n");
    console.log(`  git tag -d v${newVersion}`);
    console.log("  git checkout main");
    console.log(`  git branch -D ${branchName}\n`);
    return;
  }

  runVisible(`git push -u origin ${branchName}`);
  runVisible(`git push origin v${newVersion}`);

  runVisible(
    `gh pr create --title "release: v${newVersion}" --body "Bumps version from ${oldVersion} to ${newVersion}."`,
  );

  console.log(`\n✓ Release PR created for v${newVersion}.\n`);
  console.log("  Merge the PR to trigger the publish workflow.\n");
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bumpType = args.find((a) => !a.startsWith("--")) as BumpType;

if (!VALID_BUMP_TYPES.includes(bumpType)) {
  console.error("\nUsage: yarn release <patch|minor|major> [--dry-run]\n");
  console.error("  patch    1.1.0 → 1.1.1");
  console.error("  minor    1.1.0 → 1.2.0");
  console.error("  major    1.1.0 → 2.0.0");
  console.error("\n  --dry-run  Do everything locally but skip push and PR.\n");
  process.exit(1);
}

release(bumpType, dryRun);
