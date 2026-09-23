import cv2
import time
from keys import Key
from HandTrackingModule import HandDetector
from pynput.keyboard import Controller, Key as PynputKey


def getMousePos(event, x, y, flags, param):
    global clickedX, clickedY
    global mouseX, mouseY
    if event == cv2.EVENT_LBUTTONUP:
        clickedX, clickedY = x, y
    if event == cv2.EVENT_MOUSEMOVE:
        mouseX, mouseY = x, y


def calculateIntDistance(pt1, pt2):
    return int(((pt1[0] - pt2[0]) ** 2 + (pt1[1] - pt2[1]) ** 2) ** 0.5)


def press_key(keyboard, text):
    """Simulate a real key press for letters, space and backspace."""
    if text == 'Space':
        keyboard.press(' ')
        keyboard.release(' ')
    elif text == '<--':
        keyboard.press(PynputKey.backspace)
        keyboard.release(PynputKey.backspace)
    elif text in ('clr', 'Show', 'Hide', 'Exit'):
        return
    elif len(text) == 1:
        keyboard.press(text.lower())
        keyboard.release(text.lower())


def apply_key(text):
    """Single place that updates the on-screen buffer + real OS keypress."""
    if text == '<--':
        textBox.text = textBox.text[:-1]
        press_key(keyboard, '<--')
    elif text == 'clr':
        textBox.text = ''
    elif len(textBox.text) < 30:
        textBox.text += " " if text == 'Space' else text
        press_key(keyboard, text)


# Creating keys
w, h = 80, 60
startX, startY = 40, 200
keys = []
letters = list("QWERTYUIOPASDFGHJKLZXCVBNM")

for i, l in enumerate(letters):
    if i < 10:
        keys.append(Key(startX + i * (w + 5), startY, w, h, l))
    elif i < 19:
        keys.append(Key(startX + (i - 10) * (w + 5), startY + h + 5, w, h, l))
    else:
        keys.append(Key(startX + (i - 19) * (w + 5), startY + 2 * (h + 5), w, h, l))

keys.append(Key(startX + 25, startY + 3 * (h + 5) + 15, 5 * w, h, "Space"))
keys.append(Key(startX + 8 * w + 50, startY + 2 * (h + 5) + 10, w, h, "clr"))
keys.append(Key(startX + 5 * w + 30, startY + 3 * (h + 5) + 15, 5 * w, h, "<--"))

showKey = Key(300, 5, 80, 50, 'Show')
exitKey = Key(300, 65, 80, 50, 'Exit')
textBox = Key(startX, startY - h - 5, 10 * w + 9 * 5, h, '')


cap = cv2.VideoCapture(0)
ptime = 0

# initiating the hand tracker
tracker = HandDetector(detectionCon=0.7)

# getting frame's height and width
ret, init_frame = cap.read()
if not ret:
    raise RuntimeError("Could not read from webcam (index 0).")
frameHeight, frameWidth, _ = init_frame.shape
for _key in (showKey, exitKey):
    _key.x = int(frameWidth * 1.5) - 85

clickedX, clickedY = 0, 0
mouseX, mouseY = 0, 0

show = False
cv2.namedWindow('video')
cv2.setMouseCallback('video', getMousePos)
previousClick = 0

keyboard = Controller()
while True:
    signTipX = 0
    signTipY = 0

    thumbTipX = 0
    thumbTipY = 0

    ret, frame = cap.read()
    if not ret:
        break
    frame = cv2.resize(frame, (int(frameWidth * 1.5), int(frameHeight * 1.5)))
    frame = cv2.flip(frame, 1)
    # find hands
    frame = tracker.findHands(frame)
    lmList, _bbox = tracker.findPosition(frame, draw=False)
    if lmList:
        signTipX, signTipY = lmList[8][1], lmList[8][2]
        thumbTipX, thumbTipY = lmList[4][1], lmList[4][2]
        if calculateIntDistance((signTipX, signTipY), (thumbTipX, thumbTipY)) < 50:
            centerX = int((signTipX + thumbTipX) / 2)
            centerY = int((signTipY + thumbTipY) / 2)
            cv2.line(frame, (signTipX, signTipY), (thumbTipX, thumbTipY), (0, 255, 0), 2)
            cv2.circle(frame, (centerX, centerY), 5, (0, 255, 0), cv2.FILLED)

    ctime = time.time()
    dt = ctime - ptime
    fps = int(1 / dt) if dt > 0 else 0

    cv2.putText(frame, str(fps) + " FPS", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    showKey.drawKey(frame, (255, 255, 255), (0, 0, 0), 0.1, fontScale=0.5)
    exitKey.drawKey(frame, (255, 255, 255), (0, 0, 0), 0.1, fontScale=0.5)

    if showKey.isOver(clickedX, clickedY):
        show = not show
        showKey.text = "Hide" if show else "Show"
        clickedX, clickedY = 0, 0

    if exitKey.isOver(clickedX, clickedY):
        break

    # checking if sign finger is over a key and if click happens
    alpha = 0.5
    if show:
        textBox.drawKey(frame, (255, 255, 255), (0, 0, 0), 0.3)
        for k in keys:
            if k.isOver(mouseX, mouseY) or k.isOver(signTipX, signTipY):
                alpha = 0.1
                # writing using mouse left click
                if k.isOver(clickedX, clickedY):
                    apply_key(k.text)

                # writing using fingers: pinch with both fingertips over same key
                if k.isOver(signTipX, signTipY) and k.isOver(thumbTipX, thumbTipY):
                    clickTime = time.time()
                    if clickTime - previousClick > 0.4:
                        apply_key(k.text)
                        previousClick = clickTime
            k.drawKey(frame, (255, 255, 255), (0, 0, 0), alpha=alpha)
            alpha = 0.5
        clickedX, clickedY = 0, 0
    ptime = ctime
    cv2.imshow('video', frame)

    # stop the video when 'q' is pressed
    pressedKey = cv2.waitKey(1)
    if pressedKey == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
