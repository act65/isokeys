# check_devices.py
from evdev import InputDevice, list_devices, ecodes

print("--- Searching for Input Devices ---")
print("This script needs to be run with 'sudo' to see all devices.\n")

try:
    devices = [InputDevice(path) for path in list_devices()]
except PermissionError:
    print("!!! PERMISSION ERROR !!!")
    print("Could not access input devices. Please run this script with 'sudo'.")
    print("Example: sudo python check_devices.py")
    exit()

if not devices:
    print("No input devices found. Make sure your keyboard is connected.")
    exit()

print(f"Found {len(devices)} device(s):\n")

for device in devices:
    print(f"Path: {device.path}")
    print(f"  Name: {device.name}")
    print(f"  Phys: {device.phys}")
    
    # Get the capabilities
    caps = device.capabilities(verbose=True)
    
    # Check if it looks like a keyboard
    is_keyboard = 'EV_KEY' in caps
    
    if is_keyboard:
        print("  --> Looks like a keyboard.")
        # You can uncomment the line below for extreme detail
        # print(f"  Capabilities: {caps}")
    else:
        print("  --> Does NOT look like a keyboard.")
        
    print("-" * 20)