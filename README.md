# node-version-control
Just a simple proposed version control system with NodeJs as the hosting platform.


Requires:
imagemagick, unoconv

Commands:

node server -u 
  Parses powerpoint.ppt into version control
  
node -c
  Cleans up version control for duplicates and replaces with the PTR files to point to the newer versions.
  
node -z <version>
  Returns a zip folder containing the specified version.
