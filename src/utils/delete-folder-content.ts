import { existsSync, lstatSync, readdirSync, rmSync, unlinkSync } from "fs";
import { join } from "path";

export function rmDirContent(directoryPath: string) {
    if (existsSync(directoryPath)) {
        readdirSync(directoryPath).forEach((file) => {
            const curPath = join(directoryPath, file);

            if (lstatSync(curPath).isDirectory()) {
                // Recursively delete subdirectories
                rmSync(curPath, { recursive: true, force: true });
            } else {
                // Delete the file
                unlinkSync(curPath);
            }
        });
    }
}
