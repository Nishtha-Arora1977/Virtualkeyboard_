import cv2
import numpy as np


class Key():

    def __init__(self, x, y, w, h, text):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.text = text

    def drawKey(self, img, text_color=(255, 255, 255), bg_color=(0, 0, 0), alpha=0.5, fontFace=cv2.FONT_HERSHEY_SIMPLEX,
                fontScale=0.8, thickness=2):
        # draw the box (clip to image bounds for safety)
        img_h, img_w = img.shape[:2]
        x1, y1 = max(0, self.x), max(0, self.y)
        x2, y2 = min(img_w, self.x + self.w), min(img_h, self.y + self.h)
        if y2 <= y1 or x2 <= x1:
            return
        bg_rec = img[y1:y2, x1:x2]
        white_rect = np.ones(bg_rec.shape, dtype=np.uint8)
        white_rect[:] = bg_color
        res = cv2.addWeighted(bg_rec, alpha, white_rect, 1 - alpha, 1.0)

        # Putting the image back to its position
        img[y1:y2, x1:x2] = res

        # put the letter
        text_size = cv2.getTextSize(self.text, fontFace, fontScale, thickness)
        text_pos = (int(self.x + self.w / 2 - text_size[0][0] / 2), int(self.y + self.h / 2 + text_size[0][1] / 2))
        cv2.putText(img, self.text, text_pos, fontFace, fontScale, text_color, thickness)

    def isOver(self, x, y):
        if (self.x + self.w > x > self.x) and (self.y + self.h > y > self.y):
            return True
        return False