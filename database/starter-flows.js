/* Starter content pack, part 2: question flows, written in the app's text format
   (Question Flows > Edit as text shows the same format). KI: points to Knowledge Base articles.
   They are NOT added automatically. Library home > Add starter content lets you choose. */
(function () {
  "use strict";
  window.SDT_STARTER_FLOWS = [
    { title: "Outlook problems", category: "Microsoft 365", tags: ["outlook", "email"], keywords: ["outlook", "email", "mailbox", "send", "receive", "calendar", "shared mailbox"],
      description: "Sort out whether Outlook itself, the profile, the mailbox or the account is the problem.",
      text: [
        "Q: What is the problem with Outlook?",
        "  Outlook will not open or crashes -> Q: Does Outlook open in safe mode (outlook.exe /safe)?",
        "    Yes -> R: An add-in is probably causing it | KI: KB-007 | note: Turn add-ins off and on one at a time (File > Options > Add-ins).",
        "    No -> R: The Outlook profile may be damaged | KI: KB-008 | note: Repair or recreate the profile in Control Panel > Mail.",
        "  Cannot send or receive email -> Q: Does the mailbox work in Outlook on the web?",
        "    Yes -> R: The problem is in Outlook or on the computer | KI: KB-101 | note: Check Work Offline, the Outbox and the profile.",
        "    No -> Q: What does the web version say?",
        "      The mailbox is full -> R: The mailbox is full | KI: KB-103",
        "      The account is locked or the password is wrong -> R: Account problem | KI: KB-002, KB-001",
        "      Nothing is clear -> R: Possible mailbox or service problem | KI: KB-101 | note: Check Microsoft 365 service health, then escalate.",
        "  It keeps asking for a password -> R: Saved credentials or sign-in problem | KI: KB-102",
        "  A shared mailbox is missing -> R: Shared mailbox access | KI: KB-104",
        "  ? -> R: Get the details first | note: Ask the user to describe exactly what they see and any message on screen."
      ].join("\n") },
    { title: "Cannot print", category: "Printing", tags: ["printer", "print"], keywords: ["print", "printer", "printing", "queue", "offline", "toner"],
      description: "Find out whether it is one printer, all printers, or a printer that needs to be added.",
      text: [
        "Q: Does the problem affect one printer or every printer?",
        "  One printer -> Q: Can other people print to the same printer?",
        "    Yes -> Q: Does the user's computer show the printer as Offline?",
        "      Yes -> R: The user's connection to the printer is offline | KI: KB-113 | note: Check the port, restart the spooler and clear the queue.",
        "      No, it says Ready but nothing prints -> R: A stuck job or a driver problem | KI: KB-113, KB-031",
        "    No -> R: The printer or its network connection is down | KI: KB-113 | flow: No internet or network problems | note: Check power, paper and the message on the printer's display.",
        "  Every printer -> R: The Print Spooler or the user's profile may be the problem | KI: KB-113 | note: Restart the Print Spooler service and test again.",
        "  The user needs a printer added -> R: Add a network printer | KI: KB-114",
        "  ? -> R: Get the details first | note: Ask for the printer name and any message shown."
      ].join("\n") },
    { title: "No internet or network problems", category: "Network", tags: ["network", "internet", "wifi"], keywords: ["no internet", "network", "wifi", "wi-fi", "ethernet", "cannot connect", "offline"],
      description: "Separate a wireless, wired, VPN or home connection problem.",
      text: [
        "Q: How is the user connected?",
        "  Wi-Fi -> Q: Can other devices connect to the same Wi-Fi?",
        "    Yes -> R: A problem with this computer's wireless | KI: KB-016",
        "    No -> R: A wider Wi-Fi problem | KI: KB-016, KB-015 | note: Check whether other people are affected and escalate to the network team.",
        "  A network cable or docking station -> Q: Does the adapter show an address that starts with 169.254?",
        "    Yes -> R: The computer is not getting an IP address | KI: KB-109, KB-014",
        "    No -> Q: Can the user open internal sites but not the internet?",
        "      Yes -> R: An internet or proxy path problem | KI: KB-015, KB-013",
        "      No -> R: Check the cable, port and adapter | KI: KB-109",
        "  VPN from home -> Q: Does the home internet work without the VPN?",
        "    Yes -> R: A VPN problem | KI: KB-012, KB-110",
        "    No -> R: The user's home connection is down | note: Ask the user to restart the router and call their provider if it does not return.",
        "  ? -> R: Find out how the user connects | KI: KB-015"
      ].join("\n") },
    { title: "Slow computer", category: "Windows", tags: ["slow", "performance"], keywords: ["slow", "performance", "freezing", "lag", "takes ages", "startup", "disk full"],
      description: "Decide whether it is startup, disk space, a busy program or the network.",
      text: [
        "Q: When is the computer slow?",
        "  Only at startup or sign-in -> R: A startup problem | KI: KB-118",
        "  All the time -> Q: Is the C: drive almost full?",
        "    Yes -> R: Low disk space | KI: KB-119",
        "    No -> Q: Does Task Manager show high disk, CPU or memory use?",
        "      Yes -> R: A program or the hardware is using the resources | KI: KB-020, KB-028 | note: Note which process is busy.",
        "      No -> R: Check updates and startup apps | KI: KB-120, KB-020",
        "  Only in one program -> R: An application problem | KI: KB-028",
        "  Only on the network or VPN -> R: Network or VPN performance | KI: KB-015, KB-012",
        "  ? -> R: Get more detail | KI: KB-020 | note: Ask when it started and what changed."
      ].join("\n") },
    { title: "Cannot sign in", category: "Account Management", tags: ["login", "password", "account"], keywords: ["cannot sign in", "cant log in", "login", "password", "locked", "expired", "access denied"],
      description: "From the message the user sees to the right account article.",
      text: [
        "Q: What does the user see when signing in?",
        "  The password is wrong or expired -> Q: Does the user remember the password?",
        "    Yes -> R: The account may be locked or the password expired | KI: KB-002, KB-003",
        "    No -> R: Password reset | KI: KB-001",
        "  The account is locked -> R: Account unlock | KI: KB-002",
        "  It asks for a second step or a code -> R: An MFA problem | flow: MFA and authenticator problems",
        "  The account is disabled -> R: The account is disabled | KI: KB-004 | note: Check with HR or the manager before enabling it.",
        "  Only one application fails -> R: Application access | KI: KB-030, KB-005",
        "  Cannot sign in to Windows -> R: Windows login | KI: KB-032",
        "  ? -> R: Authentication failure | KI: KB-005"
      ].join("\n") },
    { title: "MFA and authenticator problems", category: "Security", tags: ["mfa", "authenticator"], keywords: ["mfa", "authenticator", "verification code", "second step", "duo", "yubikey", "new phone"],
      description: "Pick the second-factor method and the right article.",
      text: [
        "Q: Which MFA method does the user use?",
        "  Microsoft Authenticator -> Q: Is the user on a new or reset phone?",
        "    Yes -> R: The authenticator has to be set up again | KI: KB-023",
        "    No -> R: Notifications or codes are not working | KI: KB-023, KB-022",
        "  Duo -> R: A Duo problem | KI: KB-024",
        "  YubiKey -> R: A security key problem | KI: KB-025",
        "  Text message or phone call -> R: Check the registered phone number | KI: KB-022",
        "  The user lost the device -> R: A lost device | KI: KB-124, KB-022 | note: Verify the user's identity before resetting MFA.",
        "  ? -> R: Find out the method | KI: KB-022"
      ].join("\n") },
    { title: "Teams problems", category: "Microsoft 365", tags: ["teams", "meeting"], keywords: ["teams", "meeting", "call", "no sound", "camera", "microphone", "chat"],
      description: "Sign-in, audio, camera, cache and meeting problems in Microsoft Teams.",
      text: [
        "Q: What is wrong with Teams?",
        "  The user cannot sign in -> R: Teams sign-in | KI: KB-009, KB-005",
        "  No sound or camera -> Q: Does the headset work in other apps?",
        "    Yes -> R: Check the Teams device settings | KI: KB-105",
        "    No -> R: A headset or computer audio problem | KI: KB-117",
        "  Teams is blank, slow or crashes -> R: Clear the Teams cache | KI: KB-106",
        "  A meeting link does not work -> R: Check the account and the network | KI: KB-009, KB-015",
        "  ? -> R: Get the details | KI: KB-009"
      ].join("\n") },
    { title: "Shared drive or folder access", category: "Network", tags: ["shared drive", "folder", "permissions"], keywords: ["shared drive", "network drive", "folder", "share", "access denied", "mapped drive", "file server"],
      description: "Permissions, missing drive letters and unreachable paths.",
      text: [
        "Q: What happens when the user opens the drive or folder?",
        "  Access is denied -> Q: Has the user ever had access to it?",
        "    Yes -> R: The permission may have been removed | KI: KB-108, KB-026",
        "    No -> R: A new access request is needed | KI: KB-026, KB-108",
        "  The network path was not found -> Q: Is the user on the office network or the VPN?",
        "    Yes -> R: A mapping or name problem | KI: KB-108, KB-013",
        "    No -> R: Connect to the VPN first | KI: KB-012, KB-108",
        "  The drive letter is missing -> R: Map the drive again | KI: KB-108",
        "  It is very slow -> R: Network or file server performance | KI: KB-015, KB-108",
        "  ? -> R: Get the path first | KI: KB-108"
      ].join("\n") },
    { title: "Blue screen or random restarts", category: "Windows", tags: ["bsod", "crash", "restart"], keywords: ["blue screen", "bsod", "restart", "reboot", "crash", "stop code", "bitlocker"],
      description: "Triage crashes and unexpected restarts before escalating.",
      text: [
        "Q: Does the user see a blue screen with a stop code?",
        "  Yes -> Q: Did it start after an update, a driver or new hardware?",
        "    Yes -> R: Likely a driver or update problem | KI: KB-121, KB-120",
        "    No -> R: A hardware or system file problem | KI: KB-121",
        "  No, it restarts without warning -> R: Check power and overheating | KI: KB-121, KB-020",
        "  It asks for a BitLocker recovery key -> R: BitLocker recovery | KI: KB-122",
        "  Only one program crashes -> R: An application problem | KI: KB-028",
        "  ? -> R: Find the stop code first | KI: KB-121"
      ].join("\n") },
    { title: "Suspicious email or phishing", category: "Security", tags: ["phishing", "security"], keywords: ["phishing", "suspicious email", "spam", "scam", "clicked a link", "fake email", "lost laptop", "stolen"],
      description: "Decide quickly whether this is a normal report or a security incident.",
      text: [
        "Q: Did the user click a link, open an attachment or enter a password?",
        "  Yes -> R: Treat this as a security incident | KI: KB-123, KB-001 | note: Reset the password, revoke sessions and tell the security team right away.",
        "  No -> Q: Has the user already replied to the sender?",
        "    Yes -> R: Possible exposure | KI: KB-123 | note: Tell the security team what was shared.",
        "    No -> R: Report and block | KI: KB-123 | note: Collect the original message as an attachment, not as a forward.",
        "  The user lost a device -> R: A lost or stolen device | KI: KB-124",
        "  ? -> R: Ask the user not to click anything | KI: KB-123"
      ].join("\n") },
    { title: "Remote Desktop cannot connect", category: "Network", tags: ["rdp", "remote"], keywords: ["remote desktop", "rdp", "mstsc", "remote", "cannot connect", "3389"],
      description: "Check the VPN, the network path and the permissions for a remote desktop session.",
      text: [
        "Q: Is the user on the office network or the VPN?",
        "  No, working remotely without the VPN -> R: The VPN must be connected first | KI: KB-012, KB-111",
        "  Yes -> Q: Does a ping or port test to the target computer work?",
        "    Yes -> Q: What does the error say?",
        "      The credentials are not accepted -> R: A permission or password problem | KI: KB-112, KB-005",
        "      The computer cannot be found or reached -> R: A name or firewall problem | KI: KB-112, KB-013",
        "    No -> R: The target is off, asleep or blocked | KI: KB-112, KB-015",
        "  ? -> R: Get the computer name first | KI: KB-112"
      ].join("\n") }
  ];
})();

(function () {
  "use strict";
  window.SDT_STARTER_FLOWS.push(
    { title: "Website or browser problems", category: "Software", tags: ["browser", "website"], keywords: ["browser", "website", "edge", "chrome", "page not loading", "certificate", "not secure"],
      description: "A site that will not load, or a browser warning.",
      text: [
        "Q: What does the user see?",
        "  A certificate or not secure warning -> Q: Does the warning show on other computers or on the phone too?",
        "    Yes -> R: The site's certificate is the problem | KI: KB-126 | note: Do not let the user continue past the warning. Escalate to the site owner.",
        "    No -> R: A problem on this computer or its network | KI: KB-126, KB-125 | note: Check the date, time and any proxy.",
        "  The page will not load or keeps spinning -> Q: Does the site work in another browser or in a private window?",
        "    Yes -> R: A browser cache, cookie or extension problem | KI: KB-125",
        "    No -> Q: Does the site work for other people?",
        "      Yes -> R: A network or DNS problem on this computer | KI: KB-125, KB-013",
        "      No -> R: The site may be down | note: Check the site's status and tell the user.",
        "  The browser is slow or crashes -> R: A browser problem | KI: KB-125, KB-028",
        "  ? -> R: Get the address and the message | KI: KB-125"
      ].join("\n") },
    { title: "Laptop power or battery", category: "Hardware", tags: ["battery", "charger", "laptop"], keywords: ["battery", "charger", "not charging", "laptop shuts off", "power", "drains"],
      description: "Charging, battery life and sudden shutdowns on a laptop.",
      text: [
        "Q: What is the power problem?",
        "  The laptop does not charge -> Q: Does the charger light or the laptop's charging light come on?",
        "    Yes -> R: The battery or the charging settings | KI: KB-116 | note: Create a battery report and compare the capacity.",
        "    No -> R: The charger, cable or socket | KI: KB-116 | note: Try another socket and another charger of the same type.",
        "  The battery drains quickly -> R: Battery health or heavy apps | KI: KB-116, KB-020",
        "  The laptop shuts off suddenly -> Q: Does the laptop shut off when it is plugged in?",
        "    Yes -> R: Possible power or hardware fault | KI: KB-121, KB-116",
        "    No -> R: The battery may be failing | KI: KB-116",
        "  It is on a docking station -> R: A docking station problem | KI: KB-021",
        "  ? -> R: Find out when it happens | KI: KB-116"
      ].join("\n") }
  );
})();
