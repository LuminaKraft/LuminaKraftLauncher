#!/usr/bin/env node
import { execSync } from 'child_process';
import os from 'os';

const PORT = 1420;

async function killPort() {
  console.log(`🔍 Checking for processes using port ${PORT}...`);
  
  try {
    let killedAny = false;
    
    if (os.platform() === 'win32') {
      // Windows - more aggressive cleanup
      try {
        // First, try to find processes using the port
        const result = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
        const lines = result.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const match = line.trim().match(/\s+(\d+)$/);
          if (match && match[1] !== '0') { // Exclude system processes
            pids.add(match[1]);
          }
        });
        
        if (pids.size > 0) {
          console.log(`📋 Found ${pids.size} process(es) using port ${PORT}`);
          
          // Kill each process
          for (const pid of pids) {
            try {
              // First try graceful termination
              execSync(`taskkill /PID ${pid}`, { stdio: 'ignore' });
              console.log(`✓ Gracefully terminated process ${pid}`);
              killedAny = true;
            } catch (err) {
              try {
                // If graceful fails, force kill
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                console.log(`✓ Force killed process ${pid}`);
                killedAny = true;
              } catch (err2) {
                console.log(`✗ Failed to kill process ${pid}`);
              }
            }
          }
          
          // Additional cleanup - kill any node processes that might be hanging
          try {
            execSync(`taskkill /F /IM node.exe /FI "WINDOWTITLE eq Vite*" 2>nul`, { stdio: 'ignore' });
          } catch (err) {
            // Ignore if no matching processes
          }
          
        }
      } catch (err) {
        // No processes found using the port
      }
    } else {
      // Unix-like systems (macOS, Linux)
      try {
        const result = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' });
        const pids = result.trim().split('\n').filter(pid => pid);
        
        if (pids.length > 0) {
          console.log(`📋 Found ${pids.length} process(es) using port ${PORT}`);
          
          for (const pid of pids) {
            try {
              // First try graceful termination
              execSync(`kill ${pid}`, { stdio: 'ignore' });
              console.log(`✓ Gracefully terminated process ${pid}`);
              killedAny = true;
            } catch (err) {
              try {
                // If graceful fails, force kill
                execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
                console.log(`✓ Force killed process ${pid}`);
                killedAny = true;
              } catch (err2) {
                console.log(`✗ Failed to kill process ${pid}`);
              }
            }
          }
        }
      } catch (err) {
        // No processes found using the port
      }
    }
    
    if (killedAny) {
      console.log(`⏳ Port cleanup completed. Waiting for system to release port...`);
      // Wait longer for the OS to fully release the port
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify port is actually free
      try {
        if (os.platform() === 'win32') {
          const check = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
          if (check.trim()) {
            console.log(`⚠️  Warning: Port ${PORT} may still be in use`);
          } else {
            console.log(`✅ Port ${PORT} is now free`);
          }
        }
      } catch (err) {
        console.log(`✅ Port ${PORT} is now free`);
      }
    } else {
      console.log(`✅ Port ${PORT} is already free`);
    }
    
  } catch (error) {
    console.error('❌ Error during port cleanup:', error.message);
  }
}

// Always run when executed directly
(async () => {
  try {
    await killPort();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
})();

export default killPort; 