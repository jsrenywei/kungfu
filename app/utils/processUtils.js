const path = require('path');
const {BASE_DIR, KUNGFU_ENGINE, buildProcessLogPath} = require('__gConfig/pathConfig');
const {logger} = require('__gUtils/logUtils');
const {platform} = require('__gConfig/platformConfig');
const fkill = require('fkill');
const {getProcesses} = require('getprocesses');
const taskkill = require('taskkill')
export const pm2 = require('@/assets/js/')

//pm2 区分
let pm2Module;
if(process.env.NODE_ENV !== 'development') {
    const asarPath = path.join(process.resourcesPath, 'app.asar', 'node_modules')
    const asarPm2Path = path.join(process.resourcesPath, 'app.asar', 'node_modules', 'pm2', 'node_modules')
    const paths = require('module').paths;
    const globalPaths = require('module').globalPaths;
    globalPaths.unshift(asarPath, asarPm2Path)
    paths.unshift(asarPath, asarPm2Path)

}
else {
    
    const pm2Path = path.join('@', 'assets', 'js', 'static', 'pm2')
    logger.info(pm2Path,'===')
    logger.info(require(pm2Path), '----')
    pm2Module = require(pm2Path)
}
console.log(pm2Module, '+++++')
export const pm2 = pm2Module;

//=========================== task kill =========================================

const winKill = (tasks) => {
    let pIdList = [];
    return getProcesses().then(processes => {
        processes.forEach(p => {
            const rawCommandLine = p.rawCommandLine
            tasks.forEach(task => {
                if(rawCommandLine.indexOf(task) !== -1) pIdList.push(p.pid)
            })
        })
        if(!pIdList || !pIdList.length) return new Promise(resolve => resolve(true))
        return taskkill(pIdList, {
            force: true,
            tree: platform === 'win' 
        })
    })
}

const unixKill = (tasks) => {
    return fkill(tasks, {
        force: true,
        tree: platform === 'win'      
    })
}

const kfKill = (tasks) => {
    if(platform !== 'win') return unixKill(tasks)
    else return winKill(tasks)
}


export const KillKfc = () => kfKill(['kfc'])

export const killExtra = () => kfKill(['kfc', 'pm2'])

//=========================== pm2 manager =========================================

const pm2Connect = () => {
    return new Promise((resolve, reject) => {
        try{
            pm2.connect((err) => {
                if(err) {
                    process.exit(2);
                    logger.error(err);
                    pm2.disconnect();
                    reject(err);
                    return;
                }
                resolve([])
            })
        }catch(err){
            pm2.disconnect()
            logger.error(err)
            reject(err)
        }  
    })
}

const pm2List = () => {
    return new Promise((resolve, reject) => {
        try{
            pm2.list((err, pList) => {
                if(err){
                    logger.error(err)
                    reject(err)
                    return;
                }
                resolve(pList)
            })
        }catch(err){
            logger.error(err)
            reject(err)
        }
    })
}

const pm2Delete = async(target) => {
    return new Promise((resolve, reject) => {
        pm2Connect().then(() => {
            try{
                pm2.delete(target, err => {
                    if(err) {
                        logger.error(err)
                        reject(err)
                        return;
                    }
                    resolve(true)
                    
                })
            }catch(err){
                logger.error(err)
                reject(err)
            }
        }).catch(err => reject(err))
    })
}


const dealSpaceInPath = (pathname) => {
    const normalizePath = path.normalize(pathname);
    return normalizePath.replace(/ /g, '\ ')
}

export const describeProcess = (name) => {
    return new Promise((resolve, reject) => {
        pm2Connect().then(() => {
            try{
                pm2.describe(name, (err, res) => {
                    if(err){
                        logger.error(err)
                        reject(err);
                        return;
                    }
                    resolve(res)
                })
            }catch(err){
                logger.error(err)
                reject(err)
            }
        }).catch(err => reject(err))
    })
}

export const startProcess = async (options) => {
    const extensionName = platform === 'win' ? '.exe' : ''
    options = {
        ...options,
        "cwd": path.join(KUNGFU_ENGINE, 'kfc'),
        "script": `kfc${extensionName}`,
        "log_type": "json",
        "out_file": buildProcessLogPath(options.name),
        "err_file": buildProcessLogPath(options.name),
        "merge_logs": true,
        "logDateFormat": "YYYY-MM-DD HH:mm:ss",
        "autorestart": false,
        "max_restarts": 1,
        "watch": false,
        "force": options.force === undefined ? true : options.force,
        "exec_mode" : "fork",
        "interpreterArgs": ["~harmony", "~debug"],
        "env": {
            "KF_HOME": dealSpaceInPath(BASE_DIR),
        }
    }

    return new Promise((resolve, reject) => {
        pm2Connect().then(() => {
            try{
                pm2.start(options, (err, apps) => { 
                    if(err) {
                        logger.error(err)
                        reject(err);
                        return;
                    };
                    resolve(apps);
                })
            }catch(err){
                logger.error(err)
                reject(err)
            }
        }).catch(err => reject(err))
    })
}

//启动pageEngine
export const startPageEngine = async(force) => {
    const processName = 'page_engine'
    const pageEngines = await describeProcess(processName);
    if(pageEngines instanceof Error) throw pageEngines
    if(!force && pageEngines.length) throw new Error('page_engine正在运行！')
    return startProcess({
        "name": processName,
        "args": "paged --name paged",
    }).catch(err => logger.error(err))
}

//启动交易日服务
export const startCalendarEngine = async(force) => {
    const processName = 'calendar_engine'
    const calendarEngines = await describeProcess(processName);
    if(calendarEngines instanceof Error) throw calendarEngines
    if(!force && calendarEngines.length) throw new Error('calendar_engine正在运行！')
    return startProcess({
        "name": "calendar_engine",
        "args": "calendar --name calendar",
    }).catch(err => logger.error(err))    
}

//启动md
export const startMd = (resource, processName) => {
    return startProcess({
        "name": processName,
        "args": `md_${resource}`,
    }).catch(err => logger.error(err))      
}

//启动td
export const startTd = (resource, processName) => {
    return startProcess({
        "name": processName,
        "args": `td_${resource} --name ${processName}`,
    })   
}


//启动strategy
export const startStrategy = (strategyId, strategyPath) => {
    strategyPath = dealSpaceInPath(strategyPath)
    return startProcess({
        "name": strategyId,
        "args": `strategy --name ${strategyId} --path ${strategyPath}`,
    }).catch(err => {
        logger.error('startStrategy-err', err)
    })   
}


//列出所有进程
export const listProcessStatus = () => {
    return pm2List().then(pList => {
        let processStatus = {}
        Object.freeze(pList).forEach(p => {
            const name = p.name;
            const status = p.pm2_env.status
            processStatus[name] = status
        })
        return processStatus
    })
}

//删除进程
export const deleteProcess = (processName) => {
    return new Promise(async(resolve, reject) => {
        let processes = [];
        try{
            processes = await describeProcess(processName)
        }catch(err){
            console.error(err)
        }
        //如果進程不存在，會跳過刪除步驟
        if(!processes || !processes.length) {
            resolve(true)
            return;
        }
        const pids = processes.map(prc => prc.pid);
        pm2Delete(processName)
        .then(() => (true))
        .catch(err => reject(err))
        .finally(() => kfKill(pids).catch(err => console.error(err)))
    })
}

//干掉守护进程
export const killGodDaemon = () => {
    return new Promise((resolve, reject) => {
        pm2Connect().then(() => {
            try{
                pm2.killDaemon(err => {
                    pm2.disconnect()
                    if(err) {
                        logger.error(err)
                        reject(err)
                        return
                    }
                    resolve(true)
                })
            }catch(err){
                pm2.disconnect()
                logger.error(err)
                reject(err)
            }
        }).catch(err => reject(err))
    })
}


