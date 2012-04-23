require 'json'
require 'sinatra'
require 'sinatra/json'
require "sinatra/reloader"
require 'data_mapper'
require 'nokogiri'
require 'csv'
require 'matrix'
require 'faster_haversine'
require 'net/http'
require 'faraday'

DataMapper.setup(:default, ENV['DATABASE_URL'] || "sqlite3:motter.db")

class MapObject
	include DataMapper::Resource

	property :id,       Serial
	property :key_type, String
	property :type,     String
	property :height,   Integer
	property :lat,      Float
	property :lon,      Float
	property :x,        Float
	property :y,        Float
	property :minLon,   Float
	property :minX,     Float
	property :minLat,   Float
	property :minY,     Float
	property :maxLon,   Float
	property :maxX,     Float
	property :maxLat,   Float
	property :maxY,     Float
	property :shape,    Json
end

class BusStop
	include DataMapper::Resource

	property :id,       Serial
	property :naptan_id,String
	property :lat,      Float
	property :lon,      Float
end

def createDB
	DataMapper.finalize
	DataMapper.auto_migrate!
	DataMapper.auto_upgrade!
end

# Gets the bounds of an area given a center and a radius
# More explanations to be found in the report
def getSquare(centerLat, centerLon, radius)
  step = 0.0002777777777777778;
	
	lonRange = (radius.to_f / 19.83).to_i + 1;
	latRange = (radius.to_f / 30.89).to_i + 1;
			
	return {:minLon => centerLon - lonRange * step, :minLat => centerLat - latRange * step,
	        :maxLon => centerLon + lonRange * step, :maxLat => centerLat + latRange * step}
end

def getObjects(x, y, radius)
	square_field = {:maxX => x.to_f + radius.to_f, :maxY => y.to_f + radius.to_f, :minX => x.to_f - radius.to_f, :minY => y.to_f - radius.to_f}
	all_objects = MapObject.all(:key_type => "highway") + MapObject.all(:key_type => "building") + MapObject.all(:key_type => "bus_route")
	
	if radius != 0
		all_objects = all_objects.all(:minX.lt => square_field[:maxX],
															:minY.lt => square_field[:maxY],
															:maxX.gt => square_field[:minX],
															:maxY.gt => square_field[:minY])
	end

	return all_objects
end

# Converts longitude to cartesian coordinates.
# More info in the report
def lonToCartesian(lon, bounds)
	return (((lon * Math::PI / 180) - ((bounds[:maxLon] * Math::PI / 180) - (bounds[:minLon] * Math::PI / 180))/2) * 180 / Math::PI) * 111319.9/1.6;
end

# Converts latitude to cartesian coordinates.
# More info in the report
def latToCartesian(lat)
	return ((Math::log(Math::tan((Math::PI/4) + (lat * Math::PI / 180)/2))) * 180 / Math::PI) * 111319.9/1.6;
end

# Returns an array with the cartesian coordinates of a point with lat/lon values
def toCartesian(point, bounds)
	return {:x => lonToCartesian(point[:lon], bounds), :y => latToCartesian(point[:lat])}
end

# Store all the bus stops in the CSV file in the datastore
def storeBusStops
	england_stops = CSV.read("./stops_london.csv")
	
	BusStop.transaction do
		england_stops.each do |stop|
			new_stop = BusStop.new(:naptan_id => stop[0], 
														 :lon => stop[29],
														 :lat => stop[30])
			new_stop.save
		end
	end
end

# Finds the index of the node which is the closest to target_point in point_list
# It uses the Haversine distance to check if two points are close or not
def findClosest(point_list, target_point)
	closest = 0

	point_list.each_index do |i|
		new_dist = FasterHaversine.distance(target_point[:lat], target_point[:lon], point_list[i][:lat], point_list[i][:lon])
			
		if new_dist < FasterHaversine.distance(target_point[:lat], target_point[:lon], point_list[closest][:lat], point_list[closest][:lon])
			closest = i
		end
	end

	return closest
end

# Implementation of the cross product for Ruby 1.9.2
def crossProduct(v, w)
	 x = v[1]*w[2] - v[2]*w[1]
	 y = v[2]*w[0] - v[0]*w[2]
	 z = v[0]*w[1] - v[1]*w[0]
	 return Vector[x,y,z]
end

# Converts from latitude/longitude to vector using this formula
# http://en.wikipedia.org/wiki/N-vector#Converting_latitude.2Flongitude_to_n-vector
def toVector(point)
	return Vector[Math.cos(point[:lat])*Math.cos(point[:lon]), 
								Math.cos(point[:lat])*Math.sin(point[:lon]),
								Math.sin(point[:lat])]
end

# Actually unused, yet included for possible later use
# Finds if a point in space is after or before its closest point on the path
# Calculations are detailed in the report
def findPosition(point_list, point)
	closest = findClosest(point_list, point)

	if closest == 0 # first elem, no prev
		return closest+1
	elsif closest == point_list.length-1 # last elem, no next
		return closest-1
	else
		toPrev = toVector(point_list[closest-1]) - toVector(point_list[closest])
		toNext = toVector(point_list[closest+1]) - toVector(point_list[closest])

		toClick = toVector(point) - toVector(point_list[closest])
		toClick = toClick.normalize
		bissect = toPrev + toNext
		bissect = bissect.normalize
		
		up = crossProduct(toPrev.normalize, toNext.normalize)
		base = crossProduct(up, bissect)

		if toClick.inner_product(base) > 0
			return closest # insert right before!
		else # Warning! Miss a case where product == 0 !!
			return closest+1 # insert right after!
		end
	end
end

def pointEqual(a, b)
	return a[:lat] == b[:lat] && a[:lon] == b[:lon]
end

def withinBounds(point, bounds)
	return point[:lat] <= bounds[:maxLat] && point[:lat] >= bounds[:minLat] && point[:lon] <= bounds[:maxLon] && point[:lon] >= bounds[:minLon]
end

# Ways is an array of array of points
# Each array of points represents a way
def orderWays(ways)
	i = 0

	# While there's still ways to use as a base
	while (i < ways.length)
		j = 0

		# and while there's still ways to add to the base
		while (j < ways.length)
			# If the last node of the current base way is the same as 
			# the first node of the current way to add
			if j != i && pointEqual(ways[i].last, ways[j].first)
				# Expand the base way with the nodes from the way to add
				ways[i] = ways[i].concat(ways.delete_at(j).slice(1..-1))
				j = 0 # Start again because previous ways to add might work now
			elsif j != i && pointEqual(ways[i].first, ways[j].last)
				# Same thing but with the start of the base way
				ways[i] = ways.delete_at(j).slice(0..-2).concat(ways[i])
				j = 0
			else
				# Try the next way
				j = j + 1
			end
		end

		# As the loop resets herself when finding a way to add
		# If we arrive here it means we can't add any other way
		# And therefore we take the next way available as a base to
		# try to expand it with other ways
		i = i + 1
	end

	return ways
end

# Takes an OSM file and parse it to extract the relevant information
# It converts the coordinates and create objects ready to be stored
def parseOSM(filename)
	nodes = {} # Nodes from file, OSM ID as id
	ways = {} # Ways from file, OSM ID as id
	routes = {}
	current_way_id = nil # Are we analysing a way?
	current_way = nil # Are we analysing a way?
	current_rel_id = nil
	current_rel = nil
	current_bus_number = nil
	types = ["amenity", "barrier", "highway", "building", "barrier", "natural", 
					 "waterway", "railway", "landuse", "power", "amenity", "shop"] # Basic types to look for
	
	f = File.open(filename) # Open the OSM file
	reader = Nokogiri::XML::Reader(f) # Pass it to Nokogiri to parse

	maxLon, maxLat, minLon, minLat = nil, nil, nil, nil # Bounding box

	reader.each do |elem|
		if elem.name == "node" 
			nodes[elem.attribute("id")] = {:lat => elem.attribute("lat").to_f, :lon => elem.attribute("lon").to_f} # Strip and add to list
			
			if maxLon.nil? # First node !
				maxLon = elem.attribute("lon").to_f
				minLon = elem.attribute("lon").to_f
				maxLat = elem.attribute("lat").to_f
				minLat = elem.attribute("lat").to_f
			else # Handle bounding box
				maxLon = [maxLon, elem.attribute("lon").to_f].max
				minLon = [minLon, elem.attribute("lon").to_f].min
				maxLat = [maxLat, elem.attribute("lat").to_f].max
				minLat = [minLat, elem.attribute("lat").to_f].min
			end 
		elsif elem.name == "way"
			current_way_id = elem.attribute("id") # We found a way!
			current_way = {:nodes => [], :key_type => "unclassified", :type => "unclassified"}
		elsif elem.name == "nd" # A node in a way!
			current_way[:nodes].push(elem.attribute("ref")) # Add the node ID to the way's list
		elsif elem.name == "tag"
			if !current_way_id.nil? && (types.include? elem.attribute("k")) # Tags for ways
				current_way[:key_type] = elem.attribute("k")
				current_way[:type] = elem.attribute("v")
				ways[current_way_id] = current_way
				current_way_id = nil
			elsif !current_rel_id.nil?
				if elem.attribute("v") == "bus"
					current_rel[:id] = current_rel_id
					routes[current_bus_number] = current_rel
				elsif elem.attribute("k") == "ref"
					current_bus_number = elem.attribute("v")
				end
			end
		elsif elem.name == "member" # Bus route
			if !current_rel_id.nil?
				if elem.attribute("type") == "way"
					if ways[elem.attribute("ref")] != nil
						current_rel[:nodes].push([])
						ways[elem.attribute("ref")][:nodes].each do |node_id|
							current_rel[:nodes].last.push({:id => node_id, :lat => nodes[node_id][:lat], :lon => nodes[node_id][:lon]})
						end
					end
				end
			end
		elsif elem.name == "relation"
			current_way_id = nil # Making sure we're not adding nd when it's a rel
			current_rel_id = elem.attribute("id")
			current_rel = {:nodes => [], :id => nil}
		end
	end
	
	f.close
	
	# Bounds of the file
	bounds = {:maxLat => maxLat, :minLat => minLat, :maxLon => maxLon, :minLon => minLon}

	# This portion of code is here in case further work wants to be done
	# in the real time bus visualisation
	# It takes all the bus routes from a file given by TfL
	# And finds the position of the bus stops with the data stored in the DB
	# See StoreBusStops for more information

	# routes_stops = CSV.read("./bus_routes.csv")
	# naptan_routes = {}

	# routes_stops.each do |stop|
	# 	if routes.keys.include? stop[0]
	# 		if naptan_routes[stop[0]] == nil
	# 			naptan_routes[stop[0]] = []
	# 		end

	# 		coord = BusStop.first(:naptan_id => stop[5])

	# 		if !coord.nil?
	# 			naptan_routes[stop[0]].push({:naptan_id => stop[5], :lat => coord[:lat], :lon => coord[:lon]})
	# 		end
	# 	end
	# end

	route_portions = {}

	routes.each do |bus_num, nodes_sequence|
		nodes_sequence[:nodes] = orderWays(nodes_sequence[:nodes])
		route_portions[bus_num] = []

		nodes_sequence[:nodes].each do |portion|
			route_portions[bus_num].push({:bounds => {:maxLat => portion.first[:lat], :minLat => portion.first[:lat], :maxLon => portion.first[:lon], :minLon => portion.first[:lon]}, :portion => portion})

			portion.each do |node|
				route_portions[bus_num].last[:bounds][:maxLat] = [node[:lat], route_portions[bus_num].last[:bounds][:maxLat]].max
				route_portions[bus_num].last[:bounds][:maxLon] = [node[:lon], route_portions[bus_num].last[:bounds][:maxLon]].max
				route_portions[bus_num].last[:bounds][:minLat] = [node[:lat], route_portions[bus_num].last[:bounds][:minLat]].min
				route_portions[bus_num].last[:bounds][:minLon] = [node[:lon], route_portions[bus_num].last[:bounds][:minLon]].min

			end
		end
	end

	# Attempt to merge the bus stops from TfL into the OSM dataset
	# Failure and success are detailed in the report

	# final_routes = {}

	# naptan_routes.each do |bus_num, stop_sequence|
	# 	final_routes[bus_num] = []
	# 	fit = false
	# 	current_portion = 0

	# 	print "\n"
	# 	print bus_num
	# 	print "\n"
	# 	print route_portions[bus_num]
	# 	print "\n\n"

	# 	stop_sequence.each_index do |i|
	# 		stop = stop_sequence[i]

	# 		if current_portion < route_portions[bus_num].length
	# 			if !withinBounds(stop, route_portions[bus_num][current_portion][:bounds]) && fit
	# 				fit = false
	# 				current_portion = current_portion + 1
	# 				# Retry same node on next segment!!
	# 			elsif withinBounds(stop, route_portions[bus_num][current_portion][:bounds])
	# 				if fit == false
	# 					fit = true
	# 					final_routes[bus_num].push([])
	# 				end

	# 				position = findPosition(route_portions[bus_num][current_portion][:portion], stop)
	# 				print "Stop no #{i} found at #{position}"
	# 				print "\n"
	# 				print "http://www.openstreetmap.org/?mlat=#{stop[:lat]}&mlon=#{stop[:lon]}&zoom=30&relation=308536\nhttp://www.openstreetmap.org/?mlat=#{route_portions[bus_num][current_portion][:portion][position][:lat]}&mlon=#{route_portions[bus_num][current_portion][:portion][position][:lon]}&zoom=30&relation=308536\n"
	# 			end
	# 		end
	# 	end
	# end
	
	# Create and save all the map objects in one single transaction
	MapObject.transaction do 
		MapObject.destroy

	  ways.each do |way_id, way_values|     
	    base_node = nodes[way_values[:nodes][0]]
	    base_node_cart = toCartesian(base_node, bounds)
	    shapeNodes = [{:id => way_values[:nodes][0], :x => 0, :y => 0}]
			
	    local_maxLon = base_node[:lon]
	    local_minLon = base_node[:lon]
	    local_maxLat = base_node[:lat]
	    local_minLat = base_node[:lat]

	    way_values[:nodes][1..-1].each do |node_id|
	      local_maxLon = [local_maxLon, nodes[node_id][:lon]].max
	      local_minLon = [local_minLon, nodes[node_id][:lon]].min
	      local_maxLat = [local_maxLat, nodes[node_id][:lat]].max
	      local_minLat = [local_minLat, nodes[node_id][:lat]].min
				
	      cart_node = toCartesian(nodes[node_id], bounds)
	      cart_node[:x] -= base_node_cart[:x]
	      cart_node[:y] -= base_node_cart[:y]
	      cart_node[:id] = node_id
	      shapeNodes.push(cart_node)
	    end
			
	    r = Random.new
	    new_way = MapObject.new(:key_type => way_values[:key_type], 
	                            :type => way_values[:type], 
	                            :shape => shapeNodes, 
	                            :lat => base_node[:lat],
	                            :lon => base_node[:lon],
	                            :x => base_node_cart[:x],
	                            :y => base_node_cart[:y],
	                            :minLon => local_minLon,
	                            :minX => lonToCartesian(local_minLon, bounds),
	                            :minLat => local_minLat,
	                            :minY => latToCartesian(local_minLat),
	                            :maxLon => local_maxLon,
	                            :maxX => lonToCartesian(local_maxLon, bounds),
	                            :maxLat => local_maxLat,
	                            :maxY => latToCartesian(local_maxLat),
	                            :height => r.rand(20...42))
	    new_way.save
	  end

	  route_portions.each do |bus_num, portions|
			portions.each do |segment|
				base_node = segment[:portion].first
		    base_node_cart = toCartesian(base_node, bounds)
		    shapeNodes = [{:x => 0, :y => 0, :id => base_node[:id]}]
				
		    local_maxLon = base_node[:lon]
		    local_minLon = base_node[:lon]
		    local_maxLat = base_node[:lat]
		    local_minLat = base_node[:lat]

		    segment[:portion][1..-1].each do |node|
		      local_maxLon = [local_maxLon, node[:lon]].max
		      local_minLon = [local_minLon, node[:lon]].min
		      local_maxLat = [local_maxLat, node[:lat]].max
		      local_minLat = [local_minLat, node[:lat]].min
					
		      cart_node = toCartesian(node, bounds)
		      cart_node[:x] -= base_node_cart[:x]
		      cart_node[:y] -= base_node_cart[:y]
		      cart_node[:id] = node[:id]
		      shapeNodes.push(cart_node)
		    end
				
		    new_way = MapObject.new(:key_type => "bus_route", 
		                            :type => bus_num, 
		                            :shape => shapeNodes, 
		                            :lat => base_node[:lat],
		                            :lon => base_node[:lon],
		                            :x => base_node_cart[:x],
		                            :y => base_node_cart[:y],
		                            :minLon => local_minLon,
		                            :minX => lonToCartesian(local_minLon, bounds),
		                            :minLat => local_minLat,
		                            :minY => latToCartesian(local_minLat),
		                            :maxLon => local_maxLon,
		                            :maxX => lonToCartesian(local_maxLon, bounds),
		                            :maxLat => local_maxLat,
		                            :maxY => latToCartesian(local_maxLat),
		                            :height => 0)
		    new_way.save
		  end
		end
	end
end


# Request handling for the server

# Initialise the DB from an OSM file
# File must be in the root directory
get '/init/:file' do
	createDB()
	parseOSM(params[:file])
end

# Gets all the data from the database
get '/get_data' do
	middle_x = (MapObject.max(:maxX) + MapObject.min(:minX)) / 2
	middle_y = (MapObject.max(:maxY) + MapObject.min(:minY)) / 2
	
	# 0 means all
	all_objects = getObjects(middle_x, middle_y, 0)

	content_type :json
	all_objects.to_json
end

# Gets an area from the database using a x/y as the center and radius as the radius
get '/get_data/:x/:y/:radius' do  
	all_objects = getObjects(params[:x], params[:y], params[:radius])

	content_type :json
	all_objects.to_json
end

# Storing all the bus stops
get '/store_stops' do
	storeBusStops()
end

# Gets new data and stores it given a lat/lon
# Used by the geolocalised version.
# Can cause timeouts because processing is long and server is slow!
get '/from_location/:lat/:lon' do
	begin
		bounds = getSquare(params[:lat].to_f, params[:lon].to_f, 1000)
		url = "http://open.mapquestapi.com"
		logger.info params
		logger.info bounds
		dest = "/xapi/api/0.6/*[bbox=#{bounds[:minLon].to_s},#{bounds[:minLat].to_s},#{bounds[:maxLon].to_s},#{bounds[:maxLat].to_s}]"

		conn = Faraday.new(:url => url) do |builder|
		 	builder.request :url_encoded
		    builder.response :logger
		    builder.adapter :net_http
		end

		osm = conn.get do |req|
			req.url dest
		 	req.options = { :timeout => 500, :open_timeout => 500}
		end

		# Store the data retreived from MapQuest servers in a file
		File.open('./tmp/tmp.osm', 'wb') { |fp| fp.write(osm.body.encode('utf-8', 'iso-8859-1')) }

		# Opens the file with the parser to store the info
		createDB()
		parseOSM("./tmp/tmp.osm")

		content_type :json
		{:error => nil}.to_json
	rescue Timeout::Error
		content_type :json
		{:error => "Timeout"}.to_json
	end
end

# Normal page
get '/' do
	send_file File.join('public', 'motter.html')
end

# Geolocalised version
get '/geo' do
	send_file File.join('public', 'motter_geo.html')
end