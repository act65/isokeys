# check_devices_v2.py
from evdev import InputDevice, list_devices, ecodes
import os

print("--- Advanced Device Capability Scanner ---")
if os.geteuid() != 0:
    print("Note: This script should be run with 'sudo' for best results.\n")
else:
    print("Running with sudo privileges.\n")

try:
    devices = [InputDevice(path) for path in list_devices()]
except PermissionError:
    print("!!! PERMISSION ERROR !!!")
    print("Could not access input devices. Please run this script with 'sudo'.")
    print("Example: sudo python check_devices_v2.py")
    exit()

if not devices:
    print("No input devices found.")
    exit()

print(f"Found {len(devices)} device(s). The code for a keyboard is {ecodes.EV_KEY}.\n")

# --- These are the most likely candidates for your keyboards ---
# We will print extra detail for them.
keyboard_candidates = [
    '/dev/input/event2',  # AT Translated Set 2 keyboard
    '/dev/input/event9',  # SINO WEALTH Gaming KB
    '/dev/input/event12'  # SINO WEALTH Gaming KB Keyboard
]

for device in devices:
    print(f"Path: {device.path}")
    print(f"  Name: {device.name}")
    
    # Get capabilities using integer codes (more reliable)
    caps = device.capabilities()
    
    # Print the raw capability codes. We are looking for a '1' here.
    print(f"  Capability Codes (Keys): {list(caps.keys())}")
    
    # Check if the integer code for EV_KEY is present
    if ecodes.EV_KEY in caps:
        print("  --> SUCCESS: This device reports keyboard capabilities.")
    else:
        print("  --> FAIL: This device does NOT report standard keyboard capabilities.")

    # If this is one of our main suspects, print everything it has
    if device.path in keyboard_candidates:
        print("\n  [Detailed Dump for Keyboard Candidate]")
        try:
            # Use verbose=True to see human-readable names
            verbose_caps = device.capabilities(verbose=True)
            print(f"  Verbose Caps: {verbose_caps}\n")
        except Exception as e:
            print(f"  Could not get verbose capabilities: {e}\n")
            
    print("-" * 20)