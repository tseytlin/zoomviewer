/**
 * some overall constants
 */
// this is for fetching image thumbnails
var THUMBNAIL_WIDTH=180; 
// this is for estimating max levels
var MIN_SLIDE_WIDTH=500;

// define upload servlet
var USE_PROXY_FOR_IMAGES = true;
var PROXY_SERVLET = "http://some.server.com/any/proxy?url=";
var UPLOAD_SERVLET = "http://some.server.com/servlet/UploadServlet";

// this is SAME ORIGIN workaround proxy
// Adds "Access-Control-Allow-Origin: *" in the response header to everywhere.
var viewer;


// save list of images and properties
var sourceImages;
var sourceProperties;
var sourceCase;
var currentImage;

/**
 * redirect through some proxy URL
 */
function redirect(url,jsonp){
	var SUFFIX = jsonp?"&callback=?":"";
	var ANYORIGIN = PROXY_SERVLET;
	var url = ANYORIGIN+encodeURIComponent(url)+SUFFIX;
	return url;
}

/**
 * open viewer with a given slide object
 * @param slide
 */
function openViewer(source){
	currentImage = source;
	
	if(viewer){
		viewer.close();
	}
	$("#view").text("");
	$("#view").css("background-image","none");
	viewer = OpenSeadragon({
        id:  "view",
        prefixUrl: "images/",
        navigatorSizeRatio: 0.2,
        constrainDuringPan: false,
        visibilityRatio: 0.75,
        showNavigator:  true,
        autoHideControls: false,
        preserveViewport: true,
        tileSources: source
	});
	
	// show hide snapshot button if viewing
	// screenshot or not
	if(source.maxLevel == 1){
		$("#snapshot").hide();
	}else{
		$("#snapshot").show();
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
 * @param images
 * @param sources
 */
function loadImages(props,images,name){
	sourceImages = images;
	sourceProperties = props;
	sourceCase = name;
	
	// load images
	for(var i=0; i < images.length; i++){
		images[i].n = i;
		if(images[i].type === 'aperio'){
			loadAperioImage(props.aperio,images[i]);
		}else if (images[i].type === 'hamamatsu') {
			loadHamamatsuImage(props.hamamatsu,images[i]);
		}else if (images[i].type === 'snapshot') {
			loadSnapshot(props.snapshot,images[i]);
		}
	}
}


/**
 * load snapshot to sources
 * @param image
 */
function loadSnapshot(prop,image){
	var url = image.path;
	if(!/^https?:\/\//i.test(url)) {
		url = prop.url+url;
	}
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
	        imageURL: url,
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
			image.thumbnail = redirect(image.thumbnail,false);;
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
 * load Aperio image to sources array
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
 * show images on the images strip
 * @param images
 * @param sources
 * @returns
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
			   image.thumbnail+"\" class=\"thumbnail-img\"/>"+""+"</a></div>";
	
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

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function doSnapshot(){
	try{
		var canvas = document.getElementsByTagName("canvas")[0];
		var caseName = sourceCase;
		var slideName = currentImage.info.name;
		var offs = 1;
		for(var i=0; i < sourceImages.length; i++){
			if (sourceImages[i].type === 'snapshot') {
				offs++;
			}
		}
		var name = "figure."+pad(offs,2)+"."+slideName;
		var path = caseName+"/snapshots/"+name+".jpg"; 
		var image = {type:"snapshot",name:name,path:path,tag:"Snapshots",n:sourceImages.length};
		var dataURL = canvas.toDataURL("image/jpeg");
		
		$.post(UPLOAD_SERVLET,{data:dataURL,path:path,action:"upload",root:"image"}).done(function(data) {
			loadSnapshot(sourceProperties.snapshot,image);
			sourceImages.push(image);
			alert( "Snapshot Uploaded!" );
		});
	}catch(err){
		alert("Error: Could not take a snapshot! Cause: "+err.message);
	}
}
