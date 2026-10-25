/**
 * BackgroundTaskManager.js
 * Antigravity-Style Asynchronous Task Runner Engine
 * Cyber Agent Pro v4.0 Ultimate
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class BackgroundTaskManager {
    constructor(baseDir) {
        this.baseDir = baseDir || path.resolve(__dirname, '..');
        this.tasksFile = path.join(this.baseDir, 'memory', 'tasks.json');
        this.logsDir = path.join(this.baseDir, 'memory', 'task_logs');
        this.runningProcesses = new Map();

        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
        this.tasks = this.loadTasks();
        this.reconcileInterruptedTasks();
    }

    isPidAlive(pid) {
        if (!pid || typeof pid !== 'number') return false;
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            return e.code === 'EPERM';
        }
    }

    reconcileInterruptedTasks() {
        let changed = false;
        for (const [taskId, task] of Object.entries(this.tasks)) {
            // 1. Phục hồi và đánh dấu các task bị gián đoạn do server khởi động lại
            if (task.status === 'RUNNING' || task.status === 'QUEUED') {
                const alive = this.isPidAlive(task.pid);
                if (!alive) {
                    task.status = 'INTERRUPTED';
                    task.endTime = task.endTime || new Date().toISOString();
                    task.error = 'Tiến trình bị gián đoạn do máy chủ khởi động lại (Server Restarted)';
                    if (task.progress) {
                        task.progress.message = 'Bị gián đoạn do khởi động lại server';
                    }
                    try {
                        if (task.logFile && fs.existsSync(task.logFile)) {
                            fs.appendFileSync(task.logFile, `[${new Date().toLocaleTimeString('vi-VN')}] ⚠️ Tiến trình bị gián đoạn do máy chủ khởi động lại.\n`, 'utf8');
                        }
                    } catch (e) {}
                    changed = true;
                } else {
                    task.status = 'RUNNING_DETACHED';
                    changed = true;
                }
            }

            // 2. Tự động chuẩn hóa dữ liệu cũ: Chỉ báo 100% nếu thực sự đạt đủ số lượng mục tiêu
            const total = task.progress?.total || 0;
            const current = task.progress?.current || 0;
            if (task.status === 'COMPLETED' && total > 0 && current < total) {
                task.status = 'PARTIAL_COMPLETED';
                task.progress.percent = Math.round((current / total) * 100);
                task.progress.message = `Tiến trình kết thúc: Đạt ${current}/${total} mục tiêu (${task.progress.percent}%)`;
                changed = true;
            }
        }
        if (changed) {
            this.saveTasks();
        }
    }

    loadTasks() {
        try {
            if (fs.existsSync(this.tasksFile)) {
                return JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
            }
        } catch (e) {
            console.warn('⚠️ Lỗi đọc memory/tasks.json:', e.message);
        }
        return {};
    }

    saveTasks() {
        try {
            const dir = path.dirname(this.tasksFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.tasksFile, JSON.stringify(this.tasks, null, 2), 'utf8');
        } catch (e) {
            console.error('❌ Lỗi ghi memory/tasks.json:', e.message);
        }
    }

    createTask({ title, type = 'generic', command, scriptPath, args = [], workDir, metadata = {} }) {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const logFilePath = path.join(this.logsDir, `${taskId}.log`);
        fs.writeFileSync(logFilePath, `[${new Date().toISOString()}] === TASK CREATED: ${title} ===\n`, 'utf8');

        const taskRecord = {
            id: taskId,
            title,
            type,
            status: 'QUEUED',
            createdAt: new Date().toISOString(),
            startTime: null,
            endTime: null,
            pid: null,
            progress: {
                current: 0,
                total: metadata.totalCount || 0,
                percent: 0,
                message: 'Đang khởi động...'
            },
            logFile: logFilePath,
            workDir: workDir || this.baseDir,
            command: command || (scriptPath ? `node ${scriptPath}` : ''),
            metadata,
            result: null,
            error: null
        };

        this.tasks[taskId] = taskRecord;
        this.saveTasks();

        // Start execution asynchronously
        this.startExecution(taskId, { scriptPath, args, command, workDir });
        return taskRecord;
    }

    startExecution(taskId, { scriptPath, args = [], command, workDir }) {
        const task = this.tasks[taskId];
        if (!task) return;

        task.status = 'RUNNING';
        task.startTime = new Date().toISOString();
        this.saveTasks();

        let child;
        const cwd = workDir || task.workDir || this.baseDir;

        const appendLog = (line) => {
            try {
                fs.appendFileSync(task.logFile, `[${new Date().toLocaleTimeString('vi-VN')}] ${line}\n`, 'utf8');
            } catch (e) {}

            // Auto parse [PROGRESS] tags from output
            // Example: [PROGRESS] 12/50 (24%): Downloading video 12
            const progMatch = line.match(/\[PROGRESS\]\s*(\d+)\/(\d+)\s*(?:\(([\d.]+)%\))?:\s*(.*)/i);
            if (progMatch) {
                const current = parseInt(progMatch[1], 10);
                const total = parseInt(progMatch[2], 10);
                const percent = progMatch[3] ? parseFloat(progMatch[3]) : Math.round((current / total) * 100);
                const msg = progMatch[4] || '';
                task.progress = { current, total, percent, message: msg };
                this.saveTasks();
            }
        };

        if (scriptPath) {
            const ext = path.extname(scriptPath).toLowerCase();
            const runtime = ext === '.py' ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;
            child = spawn(runtime, [scriptPath, ...args], {
                cwd,
                shell: false,
                windowsHide: true,
                env: {
                    ...process.env,
                    TASK_ID: taskId,
                    PYTHONUTF8: '1',
                    PYTHONIOENCODING: 'utf-8'
                }
            });
        } else if (command) {
            const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
            const cmdArgs = parts.map(p => p.replace(/^(["'])|(["'])$/g, ''));
            const file = cmdArgs.shift();
            child = spawn(file, cmdArgs, {
                cwd,
                shell: false,
                windowsHide: true,
                env: { ...process.env, TASK_ID: taskId }
            });
        }

        if (!child) {
            task.status = 'FAILED';
            task.error = 'Không thể spawn tiến trình';
            this.saveTasks();
            return;
        }

        task.pid = child.pid;
        this.runningProcesses.set(taskId, child);
        this.saveTasks();

        appendLog(`🚀 Tiến trình ngầm đã chạy với PID: ${child.pid}`);

        child.stdout.on('data', d => {
            const text = d.toString();
            text.split('\n').forEach(l => {
                if (l.trim()) appendLog(l.trim());
            });
        });

        child.stderr.on('data', d => {
            const text = d.toString();
            text.split('\n').forEach(l => {
                if (l.trim()) appendLog(`[STDERR] ${l.trim()}`);
            });
        });

        child.on('close', (code, signal) => {
            this.runningProcesses.delete(taskId);
            task.endTime = new Date().toISOString();
            task.exitCode = code;

            if (task.status !== 'CANCELLED') {
                if (code === 0) {
                    const total = task.progress?.total || 0;
                    const current = task.progress?.current || 0;
                    
                    // Phân biệt: Hoàn thành tiến trình vs Hoàn thành mục tiêu nghiệp vụ
                    if (total > 0 && current < total) {
                        task.status = 'PARTIAL_COMPLETED';
                        task.progress.percent = Math.round((current / total) * 100);
                        task.progress.message = `Tiến trình kết thúc: Đạt ${current}/${total} mục tiêu (${task.progress.percent}%)`;
                        appendLog(`⚠️ Tiến trình ngầm kết thúc nhưng chỉ đạt một phần mục tiêu: ${current}/${total} (${task.progress.percent}%) (Exit code: 0)`);
                    } else {
                        task.status = 'COMPLETED';
                        task.progress.percent = 100;
                        task.progress.message = total > 0 ? `Hoàn thành 100% (${current}/${total})` : 'Hoàn thành 100%';
                        appendLog(`✅ Tiến trình ngầm hoàn thành mục tiêu (Exit code: 0)`);
                    }
                } else {
                    task.status = 'FAILED';
                    task.error = `Tiến trình kết thúc với mã lỗi: ${code}`;
                    appendLog(`❌ Tiến trình ngầm thất bại (Exit code: ${code})`);
                }
            }
            this.saveTasks();
        });

        child.on('error', err => {
            this.runningProcesses.delete(taskId);
            task.status = 'ERROR';
            task.error = err.message;
            appendLog(`❌ Lỗi hệ thống: ${err.message}`);
            this.saveTasks();
        });
    }

    cancelTask(taskId) {
        const task = this.tasks[taskId];
        if (!task) return { success: false, error: 'Không tìm thấy taskId' };

        const child = this.runningProcesses.get(taskId);
        if (child) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill.exe', ['/PID', child.pid.toString(), '/T', '/F'], { windowsHide: true });
                } else {
                    child.kill('SIGKILL');
                }
            } catch (e) {}
            this.runningProcesses.delete(taskId);
        }

        task.status = 'CANCELLED';
        task.endTime = new Date().toISOString();
        task.progress.message = 'Đã hủy theo yêu cầu của người dùng';
        this.saveTasks();
        return { success: true, message: `Đã hủy tiến trình ${taskId}` };
    }

    getTask(taskId) {
        return this.tasks[taskId] || null;
    }

    getTaskLogs(taskId, maxLines = 100) {
        const task = this.tasks[taskId];
        if (!task || !fs.existsSync(task.logFile)) return [];
        try {
            const content = fs.readFileSync(task.logFile, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            return lines.slice(-maxLines);
        } catch (e) {
            return [];
        }
    }

    listTasks() {
        return Object.values(this.tasks).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    getActiveTasks() {
        return Object.values(this.tasks).filter(t => t.status === 'RUNNING' || t.status === 'QUEUED');
    }
}

module.exports = { BackgroundTaskManager };
