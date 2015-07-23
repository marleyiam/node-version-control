var unoconv = require('unoconv'),
	fs = require('fs'),
	path = require('path'),
	mkpath = require('mkpath'),
	im = require('imagemagick'),
	crypto = require('crypto'),
	AdmZip = require('adm-zip');

function processor(inputFile, callback){
	var dir = path.dirname(inputFile) + '/';
	var ext = path.extname(inputFile);
	var filename = path.basename( inputFile, ext );

	console.log(inputFile)
	switch (ext){
		case '.ppt':
			var pdfDest = dir + filename + ".pdf";
			function processPDF(success){
				console.log("PPT: Processing PDF");

				function writeBlock(err, result, finish){
					fs.writeFile(pdfDest, result, function(){
						if (finish) finish()
					})
				}

				unoconv.convert(inputFile, 'pdf', undefined, writeBlock, function(err, data){
					writeBlock(err, data, function(){
						success();
					})
				});
			}

			imageDest = dir + filename + ext.replace(".", "_") + '_images/';
			console.log(imageDest);
			function processIMG(success){
				console.log("PPT: Processing IMG");

				mkpath(imageDest, function(){
					im.convert([pdfDest, '-density', '600', imageDest + '%02d.jpg'], 
						function(err, stdout){
						  if (err) throw err;
						  	console.log('stdout:', stdout);

						  	success();
						});
				});
			}

			processPDF(function(){
				processIMG(function(){
					callback()
				});
			});
	}
}

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

function getPdfInfo(input,cb) {
    var cmd = [
        'pdftk',
        input,
        'dump_data'
    ];
    var prog = child_process.exec(cmd.join(' '),{},cb);
}

function getDirectories(srcpath) {
  return fs.readdirSync(srcpath).filter(function(file) {
    return fs.statSync(path.join(srcpath, file)).isDirectory();
  });
}

function arrayMax(arr) {
  var len = arr.length, max = -Infinity;
  while (len--) {
    if (Number(arr[len]) > max) {
      max = Number(arr[len]);
    }
  }
  return max;
};

function checksum (str, algorithm, encoding) {
    return crypto
        .createHash(algorithm || 'md5')
        .update(str, 'utf8')
        .digest(encoding || 'hex')
}

function processStack(functions, success){
	var i = 0;

	function call(){
		if (i == functions.length){
			if (success != undefined)
				success();
			
			return;
		}

		functions[i](function(){
			i++;
			call();
		});
	}
	call();
}

function deleteFile(src, success){
    fs.unlink(src, function(err) {
 		if(err) throw err;

 		success();
	});
}

function newFile(src, content, success){
	fs.writeFile(src, content, function(){
		if (success) success()
	})
}

function copyFile(src, dest, success){
	var source = fs.createReadStream(src);
	var dest = fs.createWriteStream(dest);

	source.on('end',function() {
		success();
	});

	source.pipe(dest);
}

function moveFile(src, dest, success){
	copyFile(src, dest, function(){
	    fs.unlink(src, function(err) {
	 		if(err) throw err;

	 		success();
		});
	})
}

function readFile(src, success){
	fs.readFile(src, function (err, data) {
		success(data);
	});
}

function resolveFile(p, success){
	var dir = path.dirname(p) + '/';
	var ext = path.extname(p);
	var filename = path.basename( p, ext );

	fs.readFile(p, "utf-8", function (err, data) {
		if (err){
			if (ext == '.ptr'){
				success();
			}else{
				resolveFile(p + '.ptr', function(d){
					success(d);
				})
			}
		}else{
			if (ext == '.ptr'){
				console.log(data);
				resolveFile(data, function(d){
					success(d);
				})
			}else{
				success(p);
			}
		}
	});
}

var _id = "00001", dirs, vers, inputFile = 'powerpoint.ppt';

function getAssetsPath(){
	return 'output/';
}

function getAssetPath(){
	return getAssetsPath() + _id + '/';
}

function getVersionPath(vers){
	return getAssetPath() + vers + '/';
}

function getLatestVersion(){
	var dirs = getDirectories(getAssetPath());
	return (dirs.length > 0 ? parseInt(arrayMax(dirs)) : 0);
}

function getLatestVersionPath(){
	return getVersionPath(getLatestVersion());
}

function putLatestVersion(success, failure){
	var v = getLatestVersion() + 1,
		p = getVersionPath(v);

	mkpath(p, function(){
		success(v, p);
	});
}

function putCurrent(){
	var p = getAssetPath() + 'current/';
	mkpath(p, function(){
		success(p);
	});
}

function buildCurrent(){
	var p = putCurrent();
	var v = getLatestVersion();
}

function getUpload(){
	putLatestVersion(function(v, p){
		var pptDest = p + 'powerpoint.ppt';

		copyFile('powerpoint.ppt', pptDest, function(){
			console.log("Processing");
			processor(pptDest, function(){
				console.log("Done!");
			});
		});
	})
}

//Iterate through folder.
var walk = function(dir, done, prefix) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
   		var fName = file;
      file = path.join(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          }, fName);
        } else {
          results.push(prefix ? prefix + '/' + fName : fName);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

//Cleanup method.
//Delete files recursively from the FIRST REVISION ONWARDS.
//Check if file exists in next vers and is the same, if it does, delete me and replace with a pointer.
//If file does not exist in next vers, do nothing.
//If the file is newer, do nothing.

//GetHistory method
//Request a version.
//Focus on a tmp folder.
//Iterate through verson files, resolve pointers accordingly.
//Pointers can be in a CHAIN.
function cleanup(complete){
	var assetPath = getAssetPath();
	var currentVersion = getLatestVersion();
	var currentVersionPath = getLatestVersionPath();

	function pointFiles(currentFile, futureFile, callback){
		if (currentFile.endsWith('.DS_Store') || currentFile.endsWith('.ptr') )
			return callback();

		fs.readFile(currentFile, function (err, cFileData) {
			if(err){
				//File does not exist.
				return callback();
			}
	    	var cFileChecksum = checksum(cFileData);

			fs.readFile(futureFile, function (err, fFileData) {
				if(err){
					//File does not exist.
					return callback();
				}

		    	var fFileChecksum = checksum(fFileData);
		    	
		    	if (cFileChecksum == fFileChecksum){
		    		//Files are the same!

		    		newFile(currentFile + ".ptr", futureFile, function(){
		    			deleteFile(currentFile, function(){
		    				callback();
		    			});
		    		})

		    	}else{
		    		callback();
		    	}
			});
		});
	}

	function processVersion(vIndex, complete){
		if (vIndex >= currentVersion)
			return complete();

		var iPath = getVersionPath(vIndex);

		walk(iPath, function(n, results){
			var nextVersion = vIndex+1;
			var nextVersionPath = getVersionPath(nextVersion);

			function processFile(index){
				if (index >= results.length)
					return processVersion(nextVersion, function(){
						console.log("Done!");
					});
				pointFiles( iPath + results[index], nextVersionPath + results[index] , function(){
					processFile(index + 1);
				})
			}
			processFile(0);
		});
	}
	processVersion(1, function(){
		console.log("Done!");
	});
}

function getVersionZip(vers){
	var iPath = getVersionPath(vers);

    var zip = new AdmZip();

    function closeZip(){
    	zip.writeZip("files.zip");
    }
    

	walk(iPath, function(n, results){
	    function addFile(p, callback){
			var dir = path.dirname(p) + '/';
			var ext = path.extname(p);
			var filename = path.basename( p, ext );
			var resolvedPath = (ext == '.ptr' ? p.replace(/\.[^/.]+$/, "") : p);

			resolveFile(p, function(n){
				console.log("Adding file : " + n + " -> " + resolvedPath);
	    		zip.addLocalFile(n, resolvedPath);
				callback();
			});
	    }

		var i = 0;
		function nextFile(){
			if (i >= results.length)
				return closeZip();

			addFile(iPath + results[i], function(){
				i++;
				nextFile();
			})
		}
		nextFile();
	});

	closeZip();
}

var command = process.argv[2];
var value = process.argv[3];
switch (command){
	case '-u':
		getUpload();
		break;
	case '-c':
		cleanup();
		break;
	case '-z':
		getVersionZip( value ? value : getLatestVersion() );
		break;
}
