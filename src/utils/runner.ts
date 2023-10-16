import { spawn } from 'child_process';
import { log, error, COLORS, logEntry } from './log';
import { getIcon } from 'src/obsidian-api-helpers/get-icon';

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
    const outputContainer = createDiv({cls: 'pull-in'});
    const errorsHeader = outputContainer.createDiv()
    const errorsContainer = outputContainer.createDiv({cls: 'pull-in'});

    const allOutputHeader = outputContainer.createDiv()
    const allOutputContainer = outputContainer.createDiv({cls: 'closed pull-in'});

    const toggler = createSpan({cls: 'clickable', text: 'output'})
    const status = toggler.createSpan({text: '('})
    const statusLogLineCounter = createSpan({text: '0'})
    const statusErrorCounter = createSpan({text: '0'})
    status.append(statusLogLineCounter)
    status.append(', errors: ')
    status.append(statusErrorCounter)
    status.append(')')
    let logLines = 0
    let errors = 0

    const errorsTogglerChevron = createSpan({cls: 'clickable', text: 'Errors'})
    errorsTogglerChevron.append(getIcon('chevron-down'))
    errorsHeader.append(errorsTogglerChevron)

    const allTogglerChevron = createSpan({cls: 'clickable', text: 'All Output'})
    allTogglerChevron.append(getIcon('chevron-down'))
    allOutputHeader.append(allTogglerChevron)

    allTogglerChevron.addEventListener('click', ()=>{
      allOutputContainer.classList.toggle('closed')
      allTogglerChevron.classList.toggle('rotate-180')
    })

    errorsTogglerChevron.addEventListener('click', ()=>{
      errorsContainer.classList.toggle('closed')
      errorsTogglerChevron.classList.toggle('rotate-180')
    })


    log(toggler, outputContainer)

    // log('env: ', JSON.stringify(process.env, null, 2))
    const scriptProcess = spawn(command, args, {
        shell: true,
        env: process.env
    });

    scriptProcess.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach((line:string) => {
        // Process each line here
        logEntry(allOutputContainer, COLORS.LOG, line)
        logLines++
        statusLogLineCounter.innerText = logLines.toString()
      });
    });

    scriptProcess.stderr.on('data', (data) => {
      // Handle any error output from the command
      logEntry(errorsContainer, COLORS.ERROR, data.toString())
      logEntry(allOutputContainer, COLORS.ERROR, data.toString())
      errors++
      statusErrorCounter.innerText = errors.toString()
      statusErrorCounter.style.color = COLORS.ERROR
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
