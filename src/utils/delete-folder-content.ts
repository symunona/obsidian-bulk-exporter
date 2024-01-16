import { existsSync, lstatSync, readdirSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import { globSync } from 'glob'
import { log } from "./log";

export function rmDirContent(directoryPath: string, ignorePattern: string) {
    if (existsSync(directoryPath)) {
        const fileMap: {[key: string]: boolean} = {}
        if (ignorePattern){
            globSync(ignorePattern, {cwd: directoryPath})
                .forEach((filePath)=>fileMap[filePath] = true)
        }

        readdirSync(directoryPath).forEach((file) => {
            // Keep if!
            if (fileMap[file]) {
                log('Not deleting file/folder as it is matching ignore rule: ', file)
                return
            }

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
