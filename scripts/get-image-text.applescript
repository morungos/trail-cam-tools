-- Command line version
-- usage:
-- osascript extract_text_from_image_live_text_ocr.applescript ~/Desktop/test/*.gif
--
-- Not fantasically accurate when the background bleeds through the bottom banner.

use framework "Vision"
use framework "Foundation"
use scripting additions -- For file operations

on run argv
	
	set {imagePath} to {item 1} of argv
	
	-- Convert file path to POSIX path
	set imagePath to POSIX path of imagePath
	
	-- Ensure the file exists before attempting to process
	if not (do shell script "test -f " & quoted form of imagePath & "; echo $?") = "0" then
		log "Error: File does not exist at path: " & imagePath
		error "File does not exist at path: " & imagePath
	end if
	
	-- Convert to NSURL
	set fileURL to (current application's NSURL's fileURLWithPath:imagePath)
	
	-- Get image content
	set theImage to (current application's NSImage's alloc()'s initWithContentsOfURL:fileURL)
	
	if theImage is missing value then
		log "Error: Image could not be loaded at path: " & imagePath
		error "Image could not be loaded at path: " & imagePath
	end if
	
	-- Set up request handler using image's raw data
	set imageData to theImage's TIFFRepresentation()
	if imageData is missing value then
		log "Error: Failed to extract TIFF representation for image: " & imagePath
		error "Failed to extract TIFF representation."
	end if
	
	set requestHandler to (current application's VNImageRequestHandler's alloc()'s initWithData:imageData options:(current application's NSDictionary's alloc()'s init()))
	
	-- Initialize text request
	set theRequest to current application's VNRecognizeTextRequest's alloc()'s init()
	set theRequest's usesLanguageCorrection to false
	set theRequest's recognitionLevel to "accurate"
	
	-- Perform the request and get the results
	(requestHandler's performRequests:(current application's NSArray's arrayWithObject:(theRequest)) |error|:(missing value))
	set theResults to theRequest's results()
	
	-- Obtain and return the string values of the results
	set theText to ""
	repeat with observation in theResults
		set recognizedText to ((first item in (observation's topCandidates:1))'s |string|() as text)
		set theText to theText & recognizedText & linefeed
	end repeat
	
	-- Get the directory and filename of the image
	-- set imageDirectory to (do shell script "dirname " & quoted form of imagePath)
	-- set imageFileNameWithExtension to (do shell script "basename " & quoted form of imagePath)
	
	-- Create the output path with the same filename but .text-data extension
	-- set outputPath to imageDirectory & "/" & imageFileNameWithExtension & ".text-data"
	
	-- Save the recognized text to a file in the same folder as the image
	-- set fileRef to open for access (outputPath as POSIX file) with write permission
	-- write theText to fileRef
	-- close access fileRef
	
	-- Log the successful processing
	copy theText to stdout
	
end run

