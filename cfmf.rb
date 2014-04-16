require 'sinatra'

get '/' do
  if params[:date]
    @year,@mon,@day = params[:date].split('-')
  end
  erb :index
end

get '/markets' do
  erb :markets
end