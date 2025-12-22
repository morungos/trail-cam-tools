#!/usr/bin/python

import sys
import os

import cv2 as cv
import numpy as np

def fourPointsTransform(frame, vertices):
  vertices = np.asarray(vertices)
  outputSize = (100, 32)
  targetVertices = np.array([
    [0, outputSize[1] - 1],
    [0, 0],
    [outputSize[0] - 1, 0],
    [outputSize[0] - 1, outputSize[1] - 1]], dtype="float32")

  rotationMatrix = cv.getPerspectiveTransform(vertices, targetVertices)
  result = cv.warpPerspective(frame, rotationMatrix, outputSize)
  return result

def decodeText(scores):
  text = ""
  alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
  for i in range(scores.shape[0]):
    c = np.argmax(scores[i][0])
    if c != 0:
      text += alphabet[c - 1]
    else:
      text += '-'

  # adjacent same letters as well as background text must be removed to get the final output
  char_list = []
  for i in range(len(text)):
    if text[i] != '-' and (not (i > 0 and text[i] == text[i - 1])):
      char_list.append(text[i])
  return ''.join(char_list)


def decodeBoundingBoxes(scores, geometry, scoreThresh):
  detections = []
  confidences = []

  ############ CHECK DIMENSIONS AND SHAPES OF geometry AND scores ############
  assert len(scores.shape) == 4, "Incorrect dimensions of scores"
  assert len(geometry.shape) == 4, "Incorrect dimensions of geometry"
  assert scores.shape[0] == 1, "Invalid dimensions of scores"
  assert geometry.shape[0] == 1, "Invalid dimensions of geometry"
  assert scores.shape[1] == 1, "Invalid dimensions of scores"
  assert geometry.shape[1] == 5, "Invalid dimensions of geometry"
  assert scores.shape[2] == geometry.shape[2], "Invalid dimensions of scores and geometry"
  assert scores.shape[3] == geometry.shape[3], "Invalid dimensions of scores and geometry"
  height = scores.shape[2]
  width = scores.shape[3]
  for y in range(0, height):

    # Extract data from scores
    scoresData = scores[0][0][y]
    x0_data = geometry[0][0][y]
    x1_data = geometry[0][1][y]
    x2_data = geometry[0][2][y]
    x3_data = geometry[0][3][y]
    anglesData = geometry[0][4][y]
    for x in range(0, width):
      score = scoresData[x]

      # If score is lower than threshold score, move to next x
      if (score < scoreThresh):
        continue

      # Calculate offset
      offsetX = x * 4.0
      offsetY = y * 4.0
      angle = anglesData[x]

      # Calculate cos and sin of angle
      cosA = math.cos(angle)
      sinA = math.sin(angle)
      h = x0_data[x] + x2_data[x]
      w = x1_data[x] + x3_data[x]

      # Calculate offset
      offset = ([offsetX + cosA * x1_data[x] + sinA * x2_data[x], offsetY - sinA * x1_data[x] + cosA * x2_data[x]])

      # Find points for rectangle
      p1 = (-sinA * h + offset[0], -cosA * h + offset[1])
      p3 = (-cosA * w + offset[0], sinA * w + offset[1])
      center = (0.5 * (p1[0] + p3[0]), 0.5 * (p1[1] + p3[1]))
      detections.append((center, (w, h), -1 * angle * 180.0 / math.pi))
      confidences.append(float(score))

  # Return detections and confidences
  return [detections, confidences]

if (len(sys.argv) < 2):
  print(' (ERROR) You must call this script with an argument (path_to_image_to_be_processed)\n')
  quit()

pathname = os.path.dirname(sys.argv[0])

image      = cv.imread(str(sys.argv[1]))

textDetectorDB18 = cv.dnn_TextDetectionModel_DB('DB_TD500_resnet18.onnx')
textDetectorDB18.setBinaryThreshold(0.3)
textDetectorDB18.setPolygonThreshold(0.5)
textDetectorDB18.setInputParams(1.0 / 255.0, (736, 736), 100)
boxes, confidences = textDetectorDB18.detect(image)

recognizer = cv.dnn.readNet("ResNet_CTC.onnx")

cropped = fourPointsTransform(frame, vertices)

print(boxes)
print(confidences)
