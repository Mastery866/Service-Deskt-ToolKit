/* Starter content pack, part 3: scripts and commands, checklists, canned responses and email templates.
   They are NOT added automatically. Library home > Add starter content lets you choose.
   Read every script before you run it. Scripts marked "Changes settings" change the computer. */
(function () {
  "use strict";
  var S = [], pk = 0;
  function sc(title, category, type, risk, o, code) {
    pk++;
    S.push({ id: "pk-sc-" + pk, title: title, category: category, type: type, filename: o.file || "", admin: !!o.admin, risk: risk, tags: o.tags || [], kis: o.kis || [], description: o.desc || "", code: code });
  }
  var ADMIN = String.raw`:: Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
`;

  /* ---- Scripts ---- */
  sc("Collect System Information", "Diagnostics", "bat", "safe", { file: "Collect_System_Information", tags: ["info", "support", "report"], kis: ["KB-020", "KB-118"],
    desc: "Saves the computer name, system information, network settings and disk space to a text file on the desktop. Handy to attach to a ticket." }, String.raw`@echo off
title Collect System Information
set "OUT=%USERPROFILE%\Desktop\SystemInfo_%COMPUTERNAME%.txt"
echo Collecting information, please wait...
echo ===== COMPUTER ===== > "%OUT%"
hostname >> "%OUT%"
whoami >> "%OUT%"
echo. >> "%OUT%"
echo ===== SYSTEM INFORMATION ===== >> "%OUT%"
systeminfo >> "%OUT%"
echo. >> "%OUT%"
echo ===== NETWORK ===== >> "%OUT%"
ipconfig /all >> "%OUT%"
echo. >> "%OUT%"
echo ===== DISK SPACE ===== >> "%OUT%"
powershell -NoProfile -Command "Get-Volume | Where-Object { $_.DriveLetter } | Format-Table DriveLetter,FileSystemLabel,SizeRemaining,Size -AutoSize" >> "%OUT%"
echo.
echo Saved to: %OUT%
pause`);

  sc("Reset Windows Update Components", "Windows Repair", "bat", "changes", { file: "Reset_Windows_Update", admin: true, tags: ["windows update", "wuauserv"], kis: ["KB-120"],
    desc: "Stops the update services, renames the update cache folders and starts the services again. Restart the computer afterwards." },
    "@echo off\ntitle Reset Windows Update Components\ncolor 0B\n\n" + ADMIN + String.raw`
echo Stopping services...
net stop wuauserv
net stop cryptSvc
net stop bits
net stop msiserver
echo.
echo Renaming the update folders...
if exist "%systemroot%\SoftwareDistribution.old" rd /s /q "%systemroot%\SoftwareDistribution.old"
if exist "%systemroot%\System32\catroot2.old" rd /s /q "%systemroot%\System32\catroot2.old"
ren "%systemroot%\SoftwareDistribution" SoftwareDistribution.old
ren "%systemroot%\System32\catroot2" catroot2.old
echo.
echo Starting services...
net start msiserver
net start bits
net start cryptSvc
net start wuauserv
echo.
echo Done. Restart the computer, then check for updates.
pause
exit /b`);

  sc("Clear Teams Cache", "Microsoft 365", "bat", "changes", { file: "Clear_Teams_Cache", tags: ["teams", "cache"], kis: ["KB-106"],
    desc: "Closes Teams and clears the cache of classic and new Teams. The user is signed out of Teams." }, String.raw`@echo off
title Clear Teams Cache
echo This signs you out of Teams. Save your work first.
pause
echo Closing Teams...
taskkill /f /im ms-teams.exe >nul 2>&1
taskkill /f /im Teams.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo Clearing the classic Teams cache...
if exist "%appdata%\Microsoft\Teams" rd /s /q "%appdata%\Microsoft\Teams"
echo Clearing the new Teams cache...
if exist "%localappdata%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams" rd /s /q "%localappdata%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams"
echo.
echo Done. Start Teams again and sign in.
pause`);

  sc("Battery Report", "Diagnostics", "bat", "safe", { file: "Battery_Report", tags: ["battery", "laptop"], kis: ["KB-116"],
    desc: "Creates a battery report on the desktop and opens it. Compare the full charge capacity with the design capacity." }, String.raw`@echo off
set "OUT=%USERPROFILE%\Desktop\battery-report.html"
powercfg /batteryreport /output "%OUT%"
echo Report saved to %OUT%
start "" "%OUT%"
pause`);

  sc("Clean Temporary Files", "Cleanup", "bat", "changes", { file: "Clean_Temp_Files", tags: ["temp", "disk space"], kis: ["KB-119"],
    desc: "Deletes the temporary files of the current user. Close your programs first." }, String.raw`@echo off
title Clean Temporary Files
echo This deletes temporary files for the current user. Close your programs first.
pause
del /q /f /s "%TEMP%\*" >nul 2>&1
for /d %%D in ("%TEMP%\*") do rd /s /q "%%D" >nul 2>&1
echo Done.
pause`);

  sc("Flush DNS and Show IP Configuration", "Network", "bat", "changes", { file: "Flush_DNS_And_IP", tags: ["dns", "ip"], kis: ["KB-109", "KB-125", "KB-013"],
    desc: "Clears the DNS cache and shows the full network configuration." }, String.raw`@echo off
ipconfig /flushdns
echo.
ipconfig /all
echo.
pause`);

  sc("Force Group Policy Update", "Windows Repair", "bat", "changes", { file: "Force_GPUpdate", tags: ["gpo", "policy"],
    desc: "Refreshes Group Policy. Some policies need a restart or a new sign-in to apply." }, String.raw`@echo off
gpupdate /force
echo.
echo Some policies need a restart or a new sign-in to apply.
pause`);

  sc("Map Network Drive", "Network", "bat", "changes", { file: "Map_Network_Drive", tags: ["drive", "share"], kis: ["KB-108"],
    desc: "Maps a network share to a drive letter. You are asked for the drive letter, the server and the share name when you copy or download it." }, String.raw`@echo off
net use {{drive}}: \\{{server}}\{{share}} /persistent:yes
if %errorlevel% equ 0 (
    echo Drive {{drive}}: is connected.
) else (
    echo Could not connect the drive. Check the path and your permissions.
)
pause`);

  sc("Disk Space Overview", "Diagnostics", "ps1", "safe", { file: "Disk_Space_Overview", tags: ["disk", "space"], kis: ["KB-119"],
    desc: "Shows the size and free space of each drive." }, String.raw`Get-Volume | Where-Object { $_.DriveLetter } |
  Select-Object DriveLetter, FileSystemLabel,
    @{n='SizeGB'; e={[math]::Round($_.Size / 1GB, 1)}},
    @{n='FreeGB'; e={[math]::Round($_.SizeRemaining / 1GB, 1)}},
    @{n='Free%'; e={[math]::Round($_.SizeRemaining * 100 / $_.Size, 0)}} |
  Format-Table -AutoSize`);

  sc("Last Boot Time and Uptime", "Diagnostics", "ps1", "safe", { file: "Uptime", tags: ["boot", "uptime"], kis: ["KB-118", "KB-121"],
    desc: "Shows when the computer last started and for how long it has been running. Useful for people who never restart." }, String.raw`$os = Get-CimInstance Win32_OperatingSystem
$up = (Get-Date) - $os.LastBootUpTime
"Last boot : $($os.LastBootUpTime)"
"Uptime    : {0} days {1} hours {2} minutes" -f $up.Days, $up.Hours, $up.Minutes`);

  sc("List Installed Software", "Diagnostics", "ps1", "safe", { file: "Installed_Software", tags: ["software", "inventory"], kis: ["KB-027"],
    desc: "Saves a list of installed programs to a CSV file on the desktop." }, String.raw`$paths = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
         'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName } |
  Select-Object DisplayName, DisplayVersion, Publisher |
  Sort-Object DisplayName |
  Export-Csv "$env:USERPROFILE\Desktop\InstalledSoftware.csv" -NoTypeInformation
"Saved to $env:USERPROFILE\Desktop\InstalledSoftware.csv"`);

  sc("Show Recent Critical Errors", "Diagnostics", "ps1", "safe", { file: "Recent_System_Errors", tags: ["event log", "crash"], kis: ["KB-121"],
    desc: "Lists the critical and error events from the System log of the last three days." }, String.raw`Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2; StartTime = (Get-Date).AddDays(-3) } -MaxEvents 30 |
  Select-Object TimeCreated, Id, ProviderName, Message |
  Format-List`);

  sc("Check Account Status (Active Directory)", "Active Directory", "ps1", "safe", { file: "Check_Account_Status", tags: ["ad", "lockout"], kis: ["KB-002", "KB-003", "KB-004"],
    desc: "Shows whether an account is enabled, locked or expired. Needs the Active Directory PowerShell module (RSAT). You are asked for the username." }, String.raw`Get-ADUser {{username}} -Properties Enabled, LockedOut, PasswordExpired, PasswordLastSet, LastLogonDate, LockoutTime |
  Select-Object SamAccountName, Enabled, LockedOut, PasswordExpired, PasswordLastSet, LastLogonDate, LockoutTime |
  Format-List`);

  sc("Unlock Account (Active Directory)", "Active Directory", "ps1", "changes", { file: "Unlock_Account", tags: ["ad", "lockout"], kis: ["KB-002"],
    desc: "Unlocks an Active Directory account. Verify the user's identity first. Needs the Active Directory PowerShell module (RSAT)." }, String.raw`Unlock-ADAccount -Identity {{username}}
Get-ADUser {{username}} -Properties LockedOut | Select-Object SamAccountName, LockedOut`);

  sc("Test Network Connection", "Network", "ps1", "safe", { file: "Test_Connection", tags: ["ping", "port"], kis: ["KB-108", "KB-109", "KB-112"],
    desc: "Tests whether a computer answers on a port, for example 445 for file shares or 3389 for Remote Desktop. You are asked for the host and the port." }, "Test-NetConnection {{host}} -Port {{port}}");

  /* ---- Run commands and registry paths ---- */
  [["Outlook in safe mode", "outlook.exe /safe", "Starts Outlook without add-ins. Good first test for crashes.", ["KB-007", "KB-101"]],
   ["Outlook reset navigation pane", "outlook.exe /resetnavpane", "Rebuilds the folder pane and favorites.", []],
   ["Mail profiles", "control mlcfg32.cpl", "Opens the Mail setup where Outlook profiles are created and repaired.", ["KB-008"]],
   ["Windows Memory Diagnostic", "mdsched.exe", "Schedules a memory test at the next restart.", ["KB-121"]],
   ["Reliability Monitor", "perfmon /rel", "A timeline of crashes and failures.", ["KB-121", "KB-028"]],
   ["Print server properties", "printui /s /t2", "Opens the installed printer drivers list.", ["KB-113"]],
   ["Remote Desktop to a computer", "mstsc /v:{{host}}", "Starts Remote Desktop to the host you enter.", ["KB-112"]],
   ["Active Directory Users and Computers", "dsa.msc", "Needs the RSAT tools.", ["KB-002"]],
   ["Group Policy Management", "gpmc.msc", "Needs the RSAT tools.", []],
   ["DNS Manager", "dnsmgmt.msc", "Needs the RSAT tools.", ["KB-013"]],
   ["DHCP Manager", "dhcpmgmt.msc", "Needs the RSAT tools.", ["KB-014"]],
   ["Windows version", "winver", "Shows the Windows edition and build.", []],
   ["Storage Sense (Settings)", "ms-settings:storagesense", "Opens storage and cleanup settings.", ["KB-119"]],
   ["Printers and scanners (Settings)", "ms-settings:printers", "Opens printer settings.", ["KB-114"]],
   ["Network status (Settings)", "ms-settings:network-status", "Opens network status.", ["KB-109"]],
   ["Troubleshoot (Settings)", "ms-settings:troubleshoot", "Opens the Windows troubleshooters.", ["KB-120"]]
  ].forEach(function (r) { sc(r[0], "Run Commands", "run", "safe", { desc: r[2], kis: r[3], tags: [] }, r[1]); });
  [["Outlook profiles", "HKCU\\Software\\Microsoft\\Office\\16.0\\Outlook\\Profiles", "One key per Outlook profile.", ["KB-008"]],
   ["Office sign-in identities", "HKCU\\Software\\Microsoft\\Office\\16.0\\Common\\Identity", "Cached Office sign-in information.", ["KB-102"]],
   ["Proxy settings (current user)", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "ProxyEnable and ProxyServer values.", ["KB-125"]],
   ["User shell folders", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "Where Desktop, Documents and Downloads point.", []],
   ["Windows Update policy (AU)", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", "Group Policy settings for automatic updates.", ["KB-120"]],
   ["Print Spooler service", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Spooler", "Start value sets the startup type.", ["KB-113"]],
   ["Printer drivers (64-bit)", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Environments\\Windows x64\\Drivers\\Version-3", "Installed printer drivers.", ["KB-113"]],
   ["Time zone", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation", "The computer's time zone settings.", ["KB-126"]],
   ["BitLocker policy", "HKLM\\SOFTWARE\\Policies\\Microsoft\\FVE", "Group Policy settings for BitLocker.", ["KB-122"]]
  ].forEach(function (r) { sc(r[0], "Registry Paths", "regpath", "safe", { desc: r[2], kis: r[3], tags: ["regedit"] }, r[1]); });

  /* ---- Checklists ---- */
  var CL = [
    { title: "New hire onboarding", description: "Accounts, equipment and access for a new employee.", items: ["Confirm the start date, the manager and the job role", "Create the account and the mailbox", "Add the user to the standard groups and distribution lists", "Set up MFA with the user", "Prepare the laptop and the accessories", "Add the access the manager approved (shared drives, VPN, applications)", "Give the user their sign-in details through a secure channel", "Show the user how to reach the Service Desk", "Record the asset tag and close the request"] },
    { title: "Remote support session", description: "A safe routine for connecting to a user's computer.", items: ["Verify the user's identity", "Ask the user's permission to connect", "Ask the user to save their work", "Start the remote session", "Explain what you are doing as you go", "Note each change in the ticket", "Ask the user to test and confirm it works", "End the session and make sure it is closed", "Record the outcome in the ticket"] },
    { title: "Printer setup", description: "Adding a new shared printer for users.", items: ["Confirm the printer model, location and approval", "Reserve or confirm the printer's IP address", "Install the approved driver on the print server", "Create the print queue and set permissions", "Print a test page from the server", "Add the printer on the first user's computer and test", "Label the printer with its name and the Service Desk contact", "Update the printer list and the documentation"] },
    { title: "Lost or stolen device response", description: "First steps when a device goes missing.", items: ["Record the device, asset tag, date, place and circumstances", "Tell the security team and the user's manager", "Reset the user's password and revoke active sessions", "Lock or wipe the device remotely if possible", "Check whether the device was encrypted and what data it held", "Ask the user to file a police report if the policy requires it", "Update the asset record", "Arrange a replacement"] },
    { title: "Suspected phishing triage", description: "Handling a reported suspicious email.", items: ["Ask the user not to click, open or reply", "Ask whether they clicked a link or entered a password", "Collect the original message as an attachment", "If anything was clicked or entered, reset the password and revoke sessions", "Report the message to the security team", "Check whether other users received it", "Ask for the sender to be blocked", "Remind the user how to spot phishing", "Record the details and close the ticket"] },
    { title: "Workstation replacement and data migration", description: "Swap an old computer for a new one without losing data.", items: ["Confirm the old and new asset tags", "Back up the user's files and settings", "Prepare the new computer with the standard image and software", "Move the data and check it opens", "Add the user's printers and mapped drives", "Test email, Teams and VPN on the new computer", "Remove the old computer from the domain and the management tools", "Collect the old computer and wipe it according to policy", "Update the asset records"] },
    { title: "Password reset with identity verification", description: "A careful routine for resetting a password.", items: ["Ask for the full name, employee ID and manager's name", "Check the answers against the directory", "Check whether the account is locked or disabled", "Reset the password and require a change at the next sign-in", "Give the temporary password through the agreed secure channel", "Ask the user to sign in and choose a new password", "Check that MFA still works", "Remind the user never to share the password", "Record the verification in the ticket"] }
  ].map(function (c, i) { c.id = "pk-cl-" + (i + 1); return c; });

  /* ---- Canned responses ---- */
  var SN = [
    ["Acknowledge ticket", "Hi {{userName}}, thank you for contacting the Service Desk. I am looking at your request now and will update you shortly."],
    ["Ask for a screenshot", "Could you please send a screenshot of the problem, or type the exact message you see? It helps me find the cause faster."],
    ["Ask when it started", "When did this start, and did anything change just before it, such as an update, a new device or a password change?"],
    ["Ask to restart and test", "Please restart your computer and try again. Let me know if the problem is still there."],
    ["Request a remote session", "With your permission, I would like to connect to your computer to look at the problem. Please save your work first, and tell me when you are ready."],
    ["Waiting for confirmation", "Hi {{userName}}, I believe the issue is fixed now. Could you please confirm it is working for you? If I do not hear back in two working days I will close the ticket."],
    ["Password reset done", "Your password has been reset. Please sign in with the temporary password and choose a new one when asked. Never share your password with anyone, including the Service Desk."],
    ["Phishing report received", "Thank you for reporting the email. Please do not click any links or open any attachments, and do not reply. We will check it and let you know."],
    ["Phishing - link was clicked", "Because you clicked the link, I am going to reset your password and ask the security team to check your account. Please do not use your account until I confirm it is safe."],
    ["Could not reproduce", "I could not reproduce the problem on my side. Could you show me the steps you take, or share your screen, so I can see it happen?"],
    ["Approval needed", "This request needs approval from your manager. Please ask them to reply to this ticket to confirm, and I will continue as soon as I receive it."],
    ["Closing - no response", "Hi {{userName}}, I have not heard back, so I am closing this ticket. If the problem returns, please reply or call us and we will reopen it."],
    ["Escalated to security", "Your report has been passed to the security team. They will contact you directly if they need more information."]
  ].map(function (s, i) { return { id: "pk-sn-" + (i + 1), title: s[0], text: s[1] }; });

  /* ---- Email templates ---- */
  var EM = [
    ["Approval needed for your request", "{{ticketNumber}} - Approval needed: {{shortDescription}}",
     "Hi {{userName}},\n\nTo continue with your request, we need approval from your manager.\n\nPlease ask your manager to reply to this message to confirm. We will continue as soon as we receive it.\n\nKind regards,\n{{analystName}}\nService Desk"],
    ["Planned maintenance notice", "Planned maintenance - {{shortDescription}}",
     "Hi all,\n\nWe will carry out planned maintenance. You may notice a short interruption during this time. Please save your work beforehand.\n\nWe will let you know when the work is finished. If you notice problems afterwards, please contact the Service Desk.\n\nKind regards,\n{{analystName}}\nService Desk"],
    ["Security reminder - phishing", "Reminder: be careful with suspicious emails",
     "Hi all,\n\nWe have seen suspicious emails asking people to click a link or share a password. Please do not click links or open attachments you did not expect, and never share your password.\n\nIf you receive a suspicious email, report it using the report button or contact the Service Desk. If you already clicked a link or entered a password, tell us straight away.\n\nKind regards,\n{{analystName}}\nService Desk"],
    ["New equipment ready for pickup", "{{ticketNumber}} - Your equipment is ready",
     "Hi {{userName}},\n\nYour equipment for {{shortDescription}} is ready. Please come to the Service Desk to collect it, and bring your ID.\n\nIf you cannot come, let us know and we will arrange something else.\n\nKind regards,\n{{analystName}}\nService Desk"],
    ["Password reset completed", "{{ticketNumber}} - Your password has been reset",
     "Hi {{userName}},\n\nYour password has been reset. Please sign in with the temporary password we gave you and choose a new one when asked.\n\nNever share your password with anyone, including the Service Desk. If you did not ask for this change, contact us right away.\n\nKind regards,\n{{analystName}}\nService Desk"],
    ["Access granted", "{{ticketNumber}} - Access granted: {{shortDescription}}",
     "Hi {{userName}},\n\nThe access you asked for has been set up. It can take a few minutes, and sometimes up to an hour, to appear. Please sign out and in again if you do not see it.\n\nIf it still does not work, reply to this message and we will look at it.\n\nKind regards,\n{{analystName}}\nService Desk"]
  ].map(function (e, i) { return { id: "pk-em-" + (i + 1), title: e[0], to: "", cc: "", subject: e[1], body: e[2] }; });

  window.SDT_STARTER_LIB = function (now) {
    var scripts = S.map(function (x) {
      return { id: x.id, title: x.title, category: x.category, type: x.type, filename: x.filename, admin: x.admin, risk: x.risk, tags: x.tags, favorite: false, kis: x.kis, description: x.description, code: x.code, history: [], createdAt: now, updatedAt: now };
    });
    return { scripts: scripts, checklists: CL, snippets: SN, emailTemplates: EM };
  };
})();
