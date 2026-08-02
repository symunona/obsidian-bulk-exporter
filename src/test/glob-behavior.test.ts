/**
 * Behavioral tests for the two `glob` consumers:
 *  - copyGlob (src/export/globCopy.ts)
 *  - rmDirContent ignorePattern (src/utils/delete-folder-content.ts)
 *
 * Written against `glob`, then the lib is swapped to `tinyglobby` —
 * these tests must pass unchanged before and after.
 */

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Plugin } from "obsidian";
import { copyGlob } from "src/export/globCopy";
import { rmDirContent } from "src/utils/delete-folder-content";
import { ExportProperties } from "src/models/export-properties";

function makeTempDir(prefix: string): string {
    return mkdtempSync(join(tmpdir(), prefix));
}

function touch(root: string, rel: string, content = "x") {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
}

function fakePlugin(basePath: string): Plugin {
    return {
        app: {
            vault: {
                adapter: { basePath },
            },
        },
    } as unknown as Plugin;
}

describe("copyGlob", () => {
    let vault: string;
    let out: string;

    beforeEach(() => {
        vault = makeTempDir("globcopy-vault-");
        out = makeTempDir("globcopy-out-");
        touch(vault, "notes/a.md");
        touch(vault, "notes/b.md");
        touch(vault, "notes/c.txt");
        touch(vault, "notes/sub/deep.md");
        touch(vault, "other/top.md");
    });

    afterEach(() => {
        rmSync(vault, { recursive: true, force: true });
        rmSync(out, { recursive: true, force: true });
    });

    function props(): ExportProperties {
        return {
            from: join("notes", "a.md"),
            toAbsoluteFs: join(out, "a.md"),
        } as ExportProperties;
    }

    it("copies matching md files into output dir, preserving relative paths", async () => {
        const plugin = fakePlugin(vault);
        const res = await copyGlob(props(), "*.md", plugin);
        const successes = res.filter((r) => r.status === "success" && r.count === 1);
        expect(successes.map((s) => s.originalPath).sort()).toEqual(["a.md", "b.md"]);
        expect(existsSync(join(out, "a.md"))).toBe(true);
        expect(existsSync(join(out, "b.md"))).toBe(true);
        expect(existsSync(join(out, "c.txt"))).toBe(false);
    });

    it("matches nested files with **", async () => {
        const plugin = fakePlugin(vault);
        const res = await copyGlob(props(), "**/*.md", plugin);
        const copied = res.filter((r) => r.status === "success" && r.count === 1);
        expect(copied.map((s) => s.originalPath).sort()).toEqual([
            "a.md",
            "b.md",
            join("sub", "deep.md"),
        ]);
        expect(existsSync(join(out, "sub", "deep.md"))).toBe(true);
    });

    it("returns empty list when nothing matches", async () => {
        const plugin = fakePlugin(vault);
        const res = await copyGlob(props(), "*.nope", plugin);
        expect(res.filter((r) => r.count === 1)).toEqual([]);
    });

    it("does not copy files outside the relative root", async () => {
        const plugin = fakePlugin(vault);
        await copyGlob(props(), "**/*.md", plugin);
        expect(existsSync(join(out, "top.md"))).toBe(false);
    });
});

describe("rmDirContent ignorePattern", () => {
    let dir: string;

    beforeEach(() => {
        dir = makeTempDir("rmdir-");
        touch(dir, "keep.md");
        touch(dir, "delete.md");
        touch(dir, "sub/nested.md");
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("deletes everything with empty ignore pattern", () => {
        rmDirContent(dir, "");
        expect(readdirSync(dir)).toEqual([]);
    });

    it("keeps files matching the ignore pattern", () => {
        rmDirContent(dir, "keep.md");
        const remaining = readdirSync(dir).sort();
        expect(remaining).toEqual(["keep.md"]);
        expect(existsSync(join(dir, "keep.md"))).toBe(true);
    });

    it("wildcard ignore keeps matching top-level files", () => {
        touch(dir, "keep2.md");
        rmDirContent(dir, "keep*");
        expect(readdirSync(dir).sort()).toEqual(["keep.md", "keep2.md"]);
    });

    it("nonexistent directory is a noop", () => {
        expect(() => rmDirContent(join(dir, "nope"), "*")).not.toThrow();
    });
});
