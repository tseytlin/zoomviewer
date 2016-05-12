/**
 * some overall constants
 */
// this is for fetching image thumbnails
var THUMBNAIL_WIDTH=180; 
// this is for estimating max levels
var MIN_SLIDE_WIDTH=500;

// define servlets
//Proxy servlet directs JSON calls
//Upload servlet saves snapshots to server
var PROXY_SERVLET =  "http://some.server.com/proxy?url=";
var UPLOAD_SERVLET = "http://some.server.com/upload";

//The proxy server was previously used more extensively to avoid
//cross-domain security (CORS) problems.
//Currently, CORS headers are set in Apache Tomcat, so proxy is used less often,
//but still used to direct JSON calls
var USE_PROXY_FOR_IMAGES = false;	//The proxy allows us to avoid 

//OpenSlide Server action strings
var OPENSLIDE_INFO_REQUEST = "?action=info&path=";
var OPENSLIDE_THUMBNAIL_REQUEST = "?action=image&path=";
var OPENSLIDE_REGION_REQUEST = "?action=region&path=";

//Prepare a var for the viewer used to view slides
var viewer;

// save list of images and properties
var sourceImages;
var sourceProperties;
var sourceCase;

//Save reference to open slide image
var currentImage;

var snapshotDiv = "snapshot";	//Save the location on the area within page to save snapshots, default is "snapshot"

//Explicitely turn momentum scrolling ("flick") off for all input types in Openseadragon viewer,
//per pathologist request
var ourGestureSettingsMouse = {
	scrollToZoom: true,
	clickToZoom: true,
	dblClickToZoom: false,
	pinchToZoom: false,
	flickEnabled: false,
	flickMinSpeed: 120,
	flickMomentum: 0,
	pinchRotate: false
}
var ourGestureSettingsTouch = {
	scrollToZoom: false,
	clickToZoom: false,
	dblClickToZoom: true,
	pinchToZoom: true,
	flickEnabled: false,
	flickMinSpeed: 120,
	flickMomentum: 0,
	pinchRotate: false
}
var ourGestureSettingsPen = {
	scrollToZoom: false,
	clickToZoom: true,
	dblClickToZoom: false,
	pinchToZoom: false,
	flickEnabled: false,
	flickMinSpeed: 120,
	flickMomentum: 0,
	pinchRotate: false
}
	
/**
 * redirect through some proxy URL
 */
function redirect(url,jsonp){
	var SUFFIX = jsonp?"&callback=?":"";
	var ANYORIGIN = PROXY_SERVLET;
	var url = ANYORIGIN+escape(url)+SUFFIX;
	return url;
}

/**
 * open viewer with a given slide object
 * @param slide
 */
function openViewer(source){
	var reopenViewer = false;	//Whether we should reopen the viewer if its already open
	
	if ((typeof currentImage !== 'undefined') && (currentImage != null) ) {
		//There's a previous image open
		if ((typeof viewer !== 'undefined') && (viewer != null) && (viewer.isOpen())) {
			//and the viewer is already open
			if (source.imageURL == currentImage.imageURL) {
				//Its the same slide or snapshot
				viewer.viewport.goHome(true); //Don't attempt to reopen the same image, just zoom out
				return;		
			}
			else {
				if ( ((currentImage.maxLevel == 1) && (source.maxLevel > 1))
					|| ((currentImage.maxLevel > 1) && (source.maxLevel == 1)) ) {
					//We're switching between a snapshot and a zoom-able image,
					//re-open the viewer with appropriate settings
					reopenViewer = true;
				}
			}
		}
	}
	
	//If the viewer is not open yet, open it
	//Also (re-)open it if we're switching between a standard image and a deep zoom image, to hide controls for single-level images
	if ((!viewer) || (reopenViewer)) {
		showControls = (source.maxLevel > 1);	//only show controls and navigator if this is a multi-level image
		$("#view").text("");
		$("#view").css("background-image","none");
		viewer = OpenSeadragon({
			id:  "view",
			autoHideControls: false,
			visibilityRatio: 0.75,
			navigatorSizeRatio: 0.2,
			showNavigator:  showControls,
			showNavigationControl: showControls,
			//preserveViewport: true,	//only relevent if we have a sequence of images, could revisit in future
			gestureSettingsMouse: ourGestureSettingsMouse,
			gestureSettingsTouch: ourGestureSettingsTouch,
			gestureSettingsPen: ourGestureSettingsPen,
			gestureSettingsUnknown: ourGestureSettingsMouse,
			crossOriginPolicy: 'anonymous'
			//ajaxWithCredentials: true	//not relevent to current security settings
		});
		viewer.addHandler("open-failed", function() {
			alert("Unable to open slide viewer; try selecting the slide again or refreshing the page.");
		});
	}

	//Open the current image in the viewer, and remember it
	viewer.open(source);
	currentImage = source;
	
	// hide snapshot button if viewing screenshot
	if(source.maxLevel == 1){
		$("#snapshot").hide();
		viewer.setMouseNavEnabled(false);
	}else{
		$("#snapshot").show();
		viewer.setMouseNavEnabled(true);
	}
}

/**
 * setup snapshot button
 */
function setupControls(){
	$("#snapshot").hide();
	$("#snapshot")
    .mouseover(function() { 
        $(this).attr("src", "images/snapshot_hover.png");
    })
    .mouseout(function() {
        $(this).attr("src", "images/snapshot_rest.png");
    });
	
}

/**
 * load a set of images into sources array
 * and add them to #images
 * @param props List of root URL's to reference for various image types
 * @param images list of images; for each image, contains information including a type (e.g. "openslide"), 
 * a filepath, and a tag to use when adding the image to the webpage
 * @param name the case name
 */
function loadImages(props,images,name){
	sourceImages = images;
	sourceProperties = props;
	sourceCase = name;
		
	// derive image names
	for(var i=0; i < images.length; i++){
		//If there's already a name, use it
		//otherwise, create one
		if (images[i].name == "") {
			if (images[i].type == "snapshot") {
				//To get the image name of a snapshot, simply use the file name without the suffix
				var endIndex = images[i].path.lastIndexOf('.');
				images[i].name = images[i].path.substr(0, endIndex);
			}
			else if (images[i].type == "label") {
				//Remove label files from the array, we're not viewing labels at this time
				images.splice(i,1);
				i--;
			}
			else {
				//Full slides; extract stain and slide number from slide file path
				nameParts = images[i].path.split("_");
				var stain = nameParts[1];
				var slideID = nameParts[2];
				images[i].name = slideID+"-"+stain;
				if (stain == "H&E") stain = "HE";
				images[i].tag = stain;
			}
		}
	}
	
	//Sort slides
	//Full slide names should start with the slide number, so full slides will come first in numerical order
	//Snapshots should start with "figure", followed by snapshot #; so snapshots will all follow full slides and appear in numerical order
	//(Snapshots are currently placed in a separate block of the page, as well)
	//var orderedImages = [];
	images.sort(function(a, b){return ((a.name<b.name)?-1:1)});
	/*Slides are sorted in reverse order, and will be processed from the end of the list to the start
	 * this is done to make it easier to filter out files that we don't actually want to view;
	 * in particular, the TIFF thumbnails that are provided alongside Mirax files
	 * (currently we'll use those as the thumbnails but not view them as full slides)
	 * Slides will now be processed in order; however, order of display will still depend on
	 * how quickly ajax requests come back from the OpenSlide server */
	
	//load sorted images
	for (var i=0; i<images.length; i++) {
		var imageDone = false;	//flag to allow us to break out of loop early
		
		//Look for duplicate names
		var j=i;
		while ((j<(images.length-1)) && (images[i].name === images[j+1].name)) {
			//Count how many duplicates we have for the current name
			j++;
		}
		if ((j-i)==1) {
			//If we have just one pair, see if it is a Mirax and paired TIFF
			if ((images[i].type === "mirax") && (images[j].type === "tiff")) {
				images[i].n = i;
				loadMiraxImage(props.openslide, images[i], images[j]);
				imageDone = true;	//Mirax will be processed by above statement and TIFF can be ignored, so we're done for this iteration
				i++;	//Skip over the duplicate next iteration
			}
			else if ((images[i].type === "tiff") && (images[j].type === "mirax")) {
				//alert(images[i].path);
				images[j].n = i;
				loadMiraxImage(props.openslide, images[j], images[i]);
				imageDone = true;	//Mirax will be processed by above statement and TIFF can be ignored, so we're done for this iteration
				i++;	//Skip over the duplicate next iteration
			}
		}
		//If we have more than one duplicate, or one duplicate that isn't Mirax/TIFF,
		//not clear what to do with it.
		//In the future, might want to generate new names, but for now, just pass them along
		if (!imageDone) {
			images[i].n = i;
			if(images[i].type === 'aperio'){
				loadAperioImage(props.aperio,images[i]);
			}else if (images[i].type === 'hamamatsu') {
				loadHamamatsuImage(props.hamamatsu,images[i]);
			}else if (images[i].type === 'snapshot') {
				loadSnapshot(props.snapshot,images[i]);
			} else if (images[i].type === 'label') {
				//Ignore labels
			} else {
				loadOpenslideImage(props.openslide,images[i]);	//if not otherwise specified, try OpenSlide viewer
			}
		}
	}
}

/**
 *Create a tilesource for viewing a snapshot in the viewer
 * @param prop URL root to use when accessing the image
 * @param image contains information about the image (including name and file path)
 */
function loadSnapshot(prop,image){
	//Construct the full URL for accessing the image
	var url = image.path;
	/*if(!/^https?:\/\//i.test(url)) {
		url = prop.url+url;
	}*/
	if (url.indexOf("snapshots\\") == -1) {
		//If the url doesn't include the path to the snapshot folder, add it
		url = sourceCase+"\\snapshots\\"+url;
	}
	url = prop.url+url;
	//Open the image in order to derive information that the viewer will need 
	//when we truly access the image for viewing
	var img = new Image();
	img.src = url;
	img.onload = function(){
		// image  has been loaded
		// add to list of sources
		var source = {
			width:  img.width,
			height: img.height,
	    	tileSize: img.width,
			maxLevel: 1,
			imageURL: new String(url),
			getTileUrl: function( level, x, y ){
	        	return this.imageURL;
	        }
		};
	    
		// add image to the slider
		addImage(image,source);
	};
}

/**
 * load Aperio image to sources array
 * @param props
 * @param image
 * @param sources
 */
function loadAperioImage(prop,image){
	$.getJSON(redirect(prop.url+image.path+"?INFO",true), function(data){
		var args = data.contents.split("\|"); 
		var imageWidth = +args[0]; 
		var imageHeight = +args[1];
		var imageTile  = +args[2];
		var imageLevels = Math.floor(Math.log(imageWidth/MIN_SLIDE_WIDTH)/Math.LN2);
		var imageURL = prop.url+image.path+"?";
		image.thumbnail = imageURL+"0+0+"+THUMBNAIL_WIDTH+"+-1";
		
		if(USE_PROXY_FOR_IMAGES){
			image.thumbnail = redirect(image.thumbnail,false);
		}
		
		// add to list of sources
		var source = {
			width:  imageWidth,
            height: imageHeight,
        	tileSize: imageTile,
            maxLevel: imageLevels,
            imageURL: imageURL ,
            getTileUrl: function( level, x, y ){
            	p = Math.pow(2,this.maxLevel-level);
            	url = this.imageURL;
            	t = this.tileSize;
            	x = x * t * p;
            	y = y * t * p;
                url = url+"0"+x+"+"+"0"+y+"+"+t+"+"+t+"+"+p;
                return USE_PROXY_FOR_IMAGES?redirect(url,false):url;
            }
		};
        
		// add image to the slider
		addImage(image,source);
		
	});
}

/**
 * load Hamamatsu image to sources array
 * @param props
 * @param image
 * @param sources
 */
function loadHamamatsuImage(prop,image){
	var login = "Sign in as Guest";
	// see if we need username/password
	if('user' in prop && 'pass' in prop){
		login = "Sign in&Username="+prop.user+"&Password="+prop.pass;
	}
	// hidden iframe trick in case cookie won't work login on iframe
	$("#loginframe").attr("src",prop.url+"?nspConnect&signin="+login);
	
	// login first
	$.getJSON(redirect(prop.url+"?nspConnect&signin="+login,true), function(data){
		$xml = $($.parseXML(data.contents));
		var status = ($xml.find("status").text()); 
		if('cookie' in data.status){
			// this works only if the image server is on the same domain (not subdomain) as the site
			// otherwise this won't do shit. I had to resort to a hack iframe solution, yak :(
			var matches = prop.url.match(/^http:\/\/.*?([^\.]+)\.(com|edu|org|gov|net)(\.[a-z]{2})?.*$/i);
			var domain = matches && (matches[1]+"."+matches[2]+((matches[3])?matches[3]:""));
			document.cookie = data.status.cookie+"; domain="+domain+"; path=/;";
			//alert("Domain: "+domain+" Cookie: "+data.status.cookie+" ==> "+document.cookie);
		}
		if("succeeded" != status){
			alert("Connection refused to "+prop.url);
		}else{
			$.getJSON(redirect(prop.url+"?GetImageDetails?ItemID="+image.path,true), function(data){
				// signin:	?nspConnect&signin=Sign in&Username="+user+"&Password="+pass,
				// guest:	?nspConnect&signin=Sign in as Guest
				// connect:	?GetImageDetails?ItemID=
				// tile:	?nspGetImage?ItemID=id&FrameWidth=w&FrameHeight=h&XPos=x&YPos=y&Lens=L&Quality=75
				// image:	?nspGetOverviewImage?ItemID="+itemID+"&FrameWidth="+w+"&FrameHeight="+h
				$xml = $($.parseXML(data.contents));
				//alert($xml.find("name").text());
				var id = image.path;
				var imageWidth = +($xml.find("pixelwidth").text()); 
				var imageHeight = +($xml.find("pixelheight").text());
				var physicalWidth = +($xml.find("physicalwidth").text()); 
				var physicalHeight = +($xml.find("physicalheight").text());
				var physicalX = +($xml.find("physicalx").text()); 
				var physicalY = +($xml.find("physicaly").text());
				var imageTile  = 256;
				var imageLevels = Math.floor(Math.log(imageWidth/MIN_SLIDE_WIDTH)/Math.LN2);
				var sourceLense = +($xml.find("sourcelens").text());
				var imageURL = prop.url+"?nspGetImage?ItemID="+id;
				//alert(imageURL);
				var frameHeight = THUMBNAIL_WIDTH*imageHeight/imageWidth;
				// add some properties to an image object
				image.name = $xml.find("name").text();
				image.thumbnail = prop.url+"?nspGetOverviewImage?ItemID="+id+"&FrameWidth="+THUMBNAIL_WIDTH+"&FrameHeight="+frameHeight; 
				//+"&FrameHeight="+h";
				
				if(USE_PROXY_FOR_IMAGES){
					image.thumbnail = redirect(image.thumbnail,false);;
				}
				
				// add to list of sources
				var source = {
					width:  imageWidth,
			        height: imageHeight,
			    	tileSize: imageTile,
			        maxLevel: imageLevels,
			        imageURL: imageURL,
			        physicalWidth: physicalWidth,
			        physicalHeight: physicalHeight,
			        physicalX: physicalX,
			        physicalY: physicalY,
			        sourceLense: sourceLense,
			        getTileUrl: function( level, x, y ){
			        	// calculate positions
			    		// this is really weird, so far it looks like physical X and Y are in fact
			    		// a center of the image
			    		// all XPos and YPos suppose to be in nm and center of an image, hence
			    		// we need to do a conversion
			    		var p = Math.pow(2,this.maxLevel-level);
			        	var t = this.tileSize;
			        	var l = +(this.sourceLense);
			        	var scale = 1/p;
			        	
			        	// calculate lense
			        	var lense = scale * l; 
			        
			        	// convert pixel top-left-corner to nm in top-left-corner
			    		var xpos = (t * x * p * this.physicalWidth  / this.width);
			    		var ypos = (t * y * p * this.physicalHeight / this.height);
			    		
			    		// lets convert it to a center of requested region
			    		xpos = xpos + (t/(2*scale)*this.physicalWidth /this.width);
			    		ypos = ypos + (t/(2*scale)*this.physicalHeight /this.height);
			    		
			    		// translate in respect to center of image
			    		// and original image offset
			    		xpos = (xpos - this.physicalWidth/2) + this.physicalX;
			    		ypos = (ypos - this.physicalHeight/2) + this.physicalY;
			    		
			    		// craft a tile URL
			    		var url = this.imageURL+"&FrameWidth="+t+"&FrameHeight="+t+
			        			"&XPos="+xpos+"&YPos="+ypos+"&Lens="+lense+"&Quality=75";
			    		return USE_PROXY_FOR_IMAGES?redirect(url,false):url;
			        }
				};
			    
				// add image to the slider
				addImage(image,source);
				
			});
		}
	});
}

/**
 * Process Mirax images, including potential matched TIFF image
 * @param prop root URL to use when accessing the image
 * @param image contains information about the image, including name and file pathname
 * @param presumedMatch includes information about what we believe to be the TIFF thumbnail associated with this Mirax image
 */
function loadMiraxImage(prop, image, presumedMatch) {
	//If a Mirax image has one and only one potential match, use that as the thumbnail
	image.thumbnail = prop.url+OPENSLIDE_THUMBNAIL_REQUEST+presumedMatch.path;
	image.thumbnail = USE_PROXY_FOR_IMAGES?redirect(image.thumbnail,false):image.thumbnail;
	
	//Aside from using the TIFF as the thumbnail, loading will proceed using OpenSlide
	loadOpenslideImage(prop, image);
}


/**
 * load image to sources array for image formats supported by OpenSlide
 * Create a source object which will serve as the TileSource specifier for OpenSeadragon
 * It may be desirable to update image type, name, path and/or tag to ensure they accuratelty reflect image data
 * 		Currently (3/8/16), type is hardcoded to "openslide", tag is hardcoded to TEMP, path is slide ID
		Currently (4/7/16) name was generated in loadImages(); for Mirax images, a thumbnail should already be specified
 * Created 3/8/16, Edmund LoPresti
 * @param prop URL for OpenSlide
 * @param image contains type, name, path, tag
 */
function loadOpenslideImage(prop,image){
	//Issue a JSON request for the OpenSlide server to send image specs
	$.getJSON(redirect(prop.url+OPENSLIDE_INFO_REQUEST+image.path,true), function(data){
		//Split the return string into an array of image specifications
		var args = data.contents.split("\n");
		
		//Define an object that can hold key/value pairs
		var Collection = function() {
			this.count=0;
			this.collection={};
			
			this.add=function(key,value) {
				if (this.collection[key]!=undefined)
					return undefined;
				this.collection[key]=value;
				return ++this.count;
			}
			
			this.remove=function(key) {
				if (this.collection[key]==undefined)
					return undefined;
				delete this.collection[key];
				return --this.count;
			}
			
			this.item=function(key) {
				return this.collection[key];
			}
		}

		//Compile a map of the information labels (keys) to data values
		var imageInfo = new Collection();
		for (var i=2; i< args.length; i++) {
			var entry = args[i];
			var equalSign = entry.indexOf("=");
			imageInfo.add(entry.substr(0,equalSign), entry.substr(equalSign+1));
		}

		//Extract desired information from the compiled collection
		//Values are stored in the collection as strings
		//Use the unary plus (+) to convert to numbers

		//Number of image levels is now based on the size of the image (see below) rather than the number of levels reported by OpenSlide
		/*var imageLevels = +(imageInfo.item("openslide.level-count"));
		if (imageLevels==undefined) {
			imageLevels = +(imageInfo.item("layer.count"));	//deprecated but may be available for slides which don't make level-count available
		}
		imageLevels--;	//levels are 0-indexed, so highest available level is level count - 1
		*/
		
		//Extract image height & width
		//First try openslide.bounds (defined for Mirax)
		//If undefined (e.g. non-Mirax), try image.width or image.height
		//If still undefined, try alternative labels
		
		var imageWidth = +(imageInfo.item("openslide.bounds-width"));
		if ((imageWidth==undefined) || (isNaN(imageWidth))) {
			imageWidth = +(imageInfo.item("image.width"));
		}
		if ((imageWidth==undefined) || (isNaN(imageWidth))) {
			imageWidth = +(imageInfo.item("openslide.level[0].width"));
		}
		if ((imageWidth==undefined) || (isNaN(imageWidth))) {
			imageWidth = +(imageInfo.item("layer.0.width"));
		}
		

		var imageHeight = +(imageInfo.item("openslide.bounds-height"));
		if ((imageHeight==undefined) || (isNaN(imageHeight))) {
			imageHeight = +(imageInfo.item("image.height"));
		}
		if ((imageHeight==undefined) || (isNaN(imageHeight))) {
			imageHeight = +(imageInfo.item("openslide.level[0].height"));
		}
		if ((imageHeight==undefined) || (isNaN(imageHeight))) {
			imageHeight = +(imageInfo.item("layer.0.height"));
		}
		
		//If openslide.bounds-(x,y) defined, extract; otherwise set startX, startY to (0,0)
		var startX = +(imageInfo.item("openslide.bounds-x"));
		if ((startX==undefined) || (isNaN(startX))) {
			startX = 0;
		}
		var startY = +(imageInfo.item("openslide.bounds-y"));
		if ((startY==undefined) || (isNaN(startY))) {
			startY = 0;
		}
		
		//Extract the tilesize 
		var tileSizeHeight = +(imageInfo.item("tile.height"));
		var tileSizeWidth = +(imageInfo.item("tile.width"));
		//OpenSeadragon can also take tileOverlap, aspectRatio as TileSource properties,
		//but these don't seem to be available in Hamamatsu and Aperio data
		//May need to determine these for other file types
		
		var imageURL = image.path;
		//If thumbnail already defined (e.g. for a Mirax with a paired TIFF), leave it; otherwise set up thumbbnail
		if ((image.thumbnail === undefined) || (image.thumbnail == null)) {
			image.thumbnail = prop.url+OPENSLIDE_THUMBNAIL_REQUEST+image.path;
			image.thumbnail = USE_PROXY_FOR_IMAGES?redirect(image.thumbnail,false):image.thumbnail;
		}
		
		//Calculate aspect ratio for use in requesting image URL's
		aspectRatio = (imageWidth/imageHeight)/(tileSizeWidth/tileSizeHeight);

		//Calculate image size
		//Currently this is only used to compare with thresholds, so scale down for more readable code
		var imageSize = (imageHeight * imageWidth)/1000000000;
		
		//Set the image levels based on image size
		if (imageSize < 2) {
			imageLevels = 6;
		}
		else if (imageSize < 6) {
			imageLevels = 7;
		}
		else if (imageSize < 16) {	
			imageLevels = 8;
		}
		else if (imageSize < 40) {
			imageLevels = 9;
		}
		else {
			imageLevels = 10;
		}
		//Adjust for aspect ratio 
		//if (aspectRatio > 2.3) {
		if (aspectRatio > 1.9) {
			//For wide images
			if (imageLevels > 6) {
				imageLevels--;	//Decrease unless we're already at a low (6) # levels
			}
		}
		else {
			//For square or narrow images
			if (imageLevels < 7) {
				imageLevels++;	//Increase if we're at a low (6) # levels
			}
		}
		
		// add to list of sources
		var source = {
			width:  imageWidth,
			height: imageHeight,
			tileWidth: tileSizeWidth,
			tileHeight: tileSizeHeight,
			maxLevel: imageLevels,
			initX: startX,
			initY: startY,
			//minLevel: 0,
			//tileOverlap: 1,
			imageURL: imageURL,
			displayAspectRatio: aspectRatio,
			
			getTileUrl: function( level, x, y ){
				//alert(x+", "+y+", "+level);
				p = Math.pow(2,level);

				x = Math.floor((x*this.width)/(p*this.displayAspectRatio));
				y = Math.floor((y*this.height)/(p));
				w = Math.floor(this.width/(p*this.displayAspectRatio));
				h = Math.floor(this.height/p);
				
				x = x+this.initX;
				y = y+this.initY;
				
				url = this.imageURL;
				url = prop.url+OPENSLIDE_REGION_REQUEST+url;
				url = url+"&x="+x+"&y="+y+"&width="+w+"&height="+h+"&size="+this._tileWidth;
				return USE_PROXY_FOR_IMAGES?redirect(url,false):url;
			}
		};			
		
		// add image to the slider
		addImage(image,source);
	});
}

/**
 * show image on the images strip
 * @param image information on the image, including name, file path, thumbnail, type, 
 * and a tag to use when placing the thumbnail on the web page
 * @param source TileSource to provide to the OpenSeadragon viewer
 */
function addImage(image,source){
	// add image info to source
	source.info = image;
	
	// find tags
	var tag = "images";
	if("tag" in image){
		tag = image.tag.replace(/[^a-zA-Z0-9]/g,'');
	}
	// check if this tag is new, add if so
	if($("#"+tag).length == 0){
		if(image.type == "snapshot"){
			$("#images").append("<div id=\""+tag+"\" class=\"tag\">"+image.tag+"</div>");
		}else{	
			$("#image-container").append("<div id=\""+tag+"\" class=\"tag\">"+image.tag+"</div>");
		}
	}
	// add image thumbnail to an appropriate tag
	var text = "<div class=\"thumbnail-div\" id=\"THUMB"+image.n+"\" title=\""+image.name+"\">"+
			   "<a href=\"#\" class=\"thumbnail-a\" id=\"IMG"+
			   image.n+"\"><img src=\""+
			   image.thumbnail+"\" class=\"thumbnail-img\"/>"+"<div class=\"thumbnail-caption\">"+image.name+"</div></a></div>";
	
	// do something else for snapshot
	if(image.type == "snapshot"){
		text =  "<div class=\"snapshot-snapshot\" id=\"THUMB"+image.n+"\" title=\""+image.name+"\">"+
				"<a href=\"#\" class=\"thumbnail-a\" id=\"IMG"+image.n+"\">"+image.name+"</a></div>";
	}
	
	$("#"+tag).append(text);
	$("#IMG"+image.n).click(function (){
		$(".thumbnail-div").css("border-color","#000");
		$("#THUMB"+image.n).css("border-color","#00F");
		openViewer(source);
	});
}

//Pad a number with leading zeros and truncate to a desired size, returning a string
function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

/* Create a snapshot of the current image in the viewer
 * @param offs starting figure number; typically 0 (we'll determine the figure #) but might want to preset it to be at least a certain number
 */
function doSnapshot(offs){
	try{
		//Get the image from the canvas
		var canvas = document.getElementsByTagName("canvas")[0];
		
		//get information about the image
		var caseName = sourceCase;
		var slideName = currentImage.info.name;
		
		//Construct a name and file path for the snapshot, starting by determining the figure number
		for(var i=0; i < sourceImages.length; i++){
			if ('type' in sourceImages[i] && sourceImages[i].type === 'snapshot') {
				offs++;
			}
		}
		if (offs > 99) {
			alert("Error: Exceeded maximum number of snapshots for this case");
			return;
		}
		var name = "figure."+pad(offs,2)+"."+slideName;
		var path = caseName+"\\snapshots\\"+name+".jpg"; 
		//Construct image information for the snapshot
		var image = {type:"snapshot",name:name,path:path,tag:snapshotDiv,n:sourceImages.length};
		
		//Convert the canvas image to jpeg format
		var dataURL = canvas.toDataURL("image/jpeg");
		
		//Create a data packet and use it for an Ajax request to the Upload servlet	
		var postData = {data:dataURL,path:path,action:"upload",root:"image"};
		var postReturn = $.post(UPLOAD_SERVLET,postData).done(function(data) {
			//process the data returned by the Ajax request
			if (data.substring(0,5) == "Error") {
				if (data.indexOf("already exists") >-1) {
					//This filename already exists, increment figure number and try again with the new name
					offs++;
					doSnapshot(offs);
				}
				else {
					//Other errors may result in Ajax being "done", if so, report them
					alert("Error when trying to upload a snapshot: "+data);
				}
			} else {
				alert( "Snapshot Uploaded! "+data);
				//Add image to the list of available images
				sourceImages.push(image);
				//Add image to the slide chooser, and prepare it to be loaded by viewer
				loadSnapshot(SERVER_PROPERTIES.snapshot,image);
			}
		})
			.fail(function(data, textStatus) {
				/*var props = "";
				for (var propertyName in data) {
					props += propertyName + ", ";
				}*/
				alert("Error when trying to upload a snapshot: "+data.statusText+", "+textStatus);
			}
		);
	}catch(err){
		alert("Error: Could not take a snapshot! Cause: "+err.message);
	}
}
