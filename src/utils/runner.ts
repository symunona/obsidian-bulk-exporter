import { spawn } from 'child_process';
import { log, error } from './log';

export function runShellCommand (commandWithArgs: string){
    const list = commandWithArgs.split(' ')
    const command = list[0]
    const args: string[] = list.splice(1)
    return runShellCommandWithArgs(command, args)
}

function runShellCommandWithArgs(command: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    log('starting: ', command)
    log('args: ', args)
    // log('env: ', JSON.stringify(process.env, null, 2))
    const scriptProcess = spawn(command, args, {
        shell: true,
        env: process.env
    });

    scriptProcess.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line:string) => {
        // Process each line here
        log(line)
      });
    });

    scriptProcess.stderr.on('data', (data) => {
      // Handle any error output from the command
      error(data.toString());
    });

    scriptProcess.on('close', (code) => {
      if (code === 0) {
        // Command ran successfully
        resolve();
      } else {
        // Command encountered an error
        error(`Command exited with code ${code}`)
        reject();
      }
    });
  });
}
